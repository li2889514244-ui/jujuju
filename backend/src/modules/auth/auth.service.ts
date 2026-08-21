import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
  OnModuleInit,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'
import * as bcrypt from 'bcryptjs'
import * as crypto from 'crypto'
import { PrismaService } from '../../prisma/prisma.service'
import { RedisService } from '../../redis/redis.service'
import { AccountStatus, Role } from '../../common/prisma-enums'

/** Cost factor for bcrypt password hashing */
const BCRYPT_ROUNDS = 12
const FEISHU_AUTH_BASE_URL = 'https://accounts.feishu.cn/open-apis/authen/v1/index'
const FEISHU_API_BASE_URL = 'https://open.feishu.cn/open-apis'
const FEISHU_STATE_TTL_SECONDS = 5 * 60
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'

interface FeishuAppTokenResponse {
  code: number
  msg: string
  app_access_token?: string
  expire?: number
}

interface FeishuOAuthTokenResponse {
  code: number
  msg: string
  access_token?: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  refresh_token_expires_in?: number
  data?: {
    access_token?: string
    token_type?: string
    expires_in?: number
    refresh_token?: string
    refresh_token_expires_in?: number
  }
}

interface FeishuUserInfoResponse {
  code: number
  msg: string
  data?: {
    name?: string
    en_name?: string
    avatar_url?: string
    avatar_thumb?: string
    avatar_middle?: string
    avatar_big?: string
    open_id?: string
    union_id?: string
    email?: string
    enterprise_email?: string
    tenant_key?: string
  }
}

interface FeishuUserInfo {
  name?: string
  avatar?: string
  openId: string
  unionId?: string
  email?: string
  tenantKey?: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '').trim()
}

function resolveLoginIdentifier(dto: LoginDto): string {
  return (dto.identifier || dto.email || '').trim()
}

function durationToSeconds(value: string, fallbackSeconds: number): number {
  const raw = String(value || '').trim().toLowerCase()
  const match = raw.match(/^(\d+)\s*([smhd])?$/)
  if (!match) return fallbackSeconds
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount <= 0) return fallbackSeconds
  const unit = match[2] || 's'
  const multiplier =
    unit === 'd' ? 24 * 60 * 60 : unit === 'h' ? 60 * 60 : unit === 'm' ? 60 : 1
  return amount * multiplier
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name)
  private jwtSecret!: string
  private jwtRefreshSecret!: string
  private jwtAccessExpires!: string
  private jwtRefreshExpires!: string
  private readonly feishuHttp: AxiosInstance

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redis: RedisService,
  ) {
    this.feishuHttp = axios.create({
      baseURL: FEISHU_API_BASE_URL,
      timeout: 10000,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
    this.loadJwtConfig()
  }

  onModuleInit() {
    this.loadJwtConfig()
  }

  private loadJwtConfig() {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET')!
    this.jwtRefreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET')!
    this.jwtAccessExpires = this.configService.get<string>('JWT_ACCESS_EXPIRES', '15m')
    this.jwtRefreshExpires = this.configService.get<string>('JWT_REFRESH_EXPIRES', '365d')

    if (!this.jwtSecret || !this.jwtRefreshSecret) {
      throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be configured. Check your .env file.')
    }
  }

  /**
   * 用户注册
   */
  async register(_dto: RegisterDto) {
    throw new ForbiddenException('Public registration is closed. Accounts must be created by invitation.')
  }

  /**
   * 用户登录
   */
  async login(dto: LoginDto) {
    const user = await this.validateUser(resolveLoginIdentifier(dto), dto.password)
    if (!user) {
      throw new UnauthorizedException('邮箱/手机号或密码错误')
    }

    // 更新最后登录时间
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    this.logger.log(`用户登录成功: ${user.email}`)

    const tokens = await this.generateTokens(user.id, user.email, user.organizationId)
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      ...tokens,
    }
  }

  /**
   * 验证用户凭证
   */
  async getFeishuAuthUrl(redirect?: string) {
    const appId = this.getFeishuAppId()
    const redirectUri = this.getFeishuRedirectUri()
    if (!appId || !this.getFeishuAppSecret() || !redirectUri) {
      throw new BadRequestException('飞书登录尚未配置')
    }

    const statePayload = {
      nonce: crypto.randomBytes(16).toString('hex'),
      redirect: this.sanitizeRedirectPath(redirect),
    }
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')
    await this.redis.setWithTTL(`feishu:oauth:state:${state}`, '1', FEISHU_STATE_TTL_SECONDS)

    const params = new URLSearchParams({
      app_id: appId,
      redirect_uri: redirectUri,
      state,
    })

    return {
      url: `${FEISHU_AUTH_BASE_URL}?${params.toString()}`,
      state,
    }
  }

  async loginWithFeishu(code: string, state: string) {
    const normalizedCode = String(code || '').trim()
    const normalizedState = String(state || '').trim()
    if (!normalizedCode || !normalizedState) {
      throw new BadRequestException('飞书登录参数不完整')
    }

    const stateKey = `feishu:oauth:state:${normalizedState}`
    const stateExists = await this.redis.exists(stateKey)
    if (!stateExists) {
      throw new UnauthorizedException('飞书登录状态已过期，请重试')
    }
    await this.redis.del(stateKey)
    const redirect = this.parseFeishuStateRedirect(normalizedState)

    const feishuUser = await this.fetchFeishuUserInfo(normalizedCode)
    const user = await this.findAndBindFeishuUser(feishuUser)

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户账号已被禁用')
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    this.logger.log(`飞书登录成功: ${user.email || user.id}`)

    const tokens = await this.generateTokens(user.id, user.email, user.organizationId)
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
      },
      redirect,
      ...tokens,
    }
  }

  async validateUser(identifier: string, password: string) {
    const loginName = identifier.trim()
    if (!loginName) {
      return null
    }

    const where = loginName.includes('@')
      ? { email: normalizeEmail(loginName) }
      : { phone: normalizePhone(loginName) }

    const user = await this.prisma.user.findUnique({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        role: true,
        status: true,
        organizationId: true,
      },
    })

    if (!user || !user.password) {
      return null
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('用户账号已被禁用')
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return null
    }

    return user
  }

  /**
   * 对 token 进行哈希，避免在 Redis Key 中存储原始 token
   */
  private getFeishuAppId(): string {
    return (this.configService.get<string>('FEISHU_LOGIN_APP_ID') || process.env.FEISHU_APP_ID || '').trim()
  }

  private getFeishuAppSecret(): string {
    return (
      this.configService.get<string>('FEISHU_LOGIN_APP_SECRET') ||
      process.env.FEISHU_APP_SECRET ||
      ''
    ).trim()
  }

  private getFeishuRedirectUri(): string {
    return (this.configService.get<string>('FEISHU_LOGIN_REDIRECT_URI') || '').trim()
  }

  private getFeishuDefaultOrganizationId(): string {
    return (this.configService.get<string>('FEISHU_LOGIN_DEFAULT_ORGANIZATION_ID') || '').trim()
  }

  private sanitizeRedirectPath(redirect?: string): string {
    const value = String(redirect || '/dashboard').trim()
    if (!value.startsWith('/') || value.startsWith('//')) return '/dashboard'
    return value
  }

  private normalizeOptionalEmail(email?: string): string | undefined {
    const normalized = String(email || '').trim().toLowerCase()
    return normalized || undefined
  }

  private parseFeishuStateRedirect(state: string): string {
    try {
      const payload = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
        redirect?: string
      }
      return this.sanitizeRedirectPath(payload.redirect)
    } catch {
      return '/dashboard'
    }
  }

  private async getFeishuAppAccessToken(): Promise<string> {
    const appId = this.getFeishuAppId()
    const appSecret = this.getFeishuAppSecret()
    if (!appId || !appSecret) {
      throw new BadRequestException('飞书登录尚未配置')
    }

    const response = await this.feishuHttp.post<FeishuAppTokenResponse>(
      '/auth/v3/app_access_token/internal',
      {
        app_id: appId,
        app_secret: appSecret,
      },
    )

    const data = response.data
    if (data.code !== 0 || !data.app_access_token) {
      throw new UnauthorizedException(`获取飞书 app_access_token 失败: ${data.msg || data.code}`)
    }

    return data.app_access_token
  }

  private async fetchFeishuUserInfo(code: string): Promise<FeishuUserInfo> {
    const appId = this.getFeishuAppId()
    const appSecret = this.getFeishuAppSecret()
    const redirectUri = this.getFeishuRedirectUri()
    const tokenResponse = await this.feishuHttp.post<FeishuOAuthTokenResponse>(
      '/authen/v2/oauth/token',
      {
        grant_type: 'authorization_code',
        client_id: appId,
        client_secret: appSecret,
        code,
        redirect_uri: redirectUri,
      },
    )

    const tokenData = tokenResponse.data
    const userAccessToken = tokenData.data?.access_token || tokenData.access_token
    if (tokenData.code !== 0 || !userAccessToken) {
      throw new UnauthorizedException(`飞书授权码换取用户令牌失败: ${tokenData.msg || tokenData.code}`)
    }

    const userResponse = await this.feishuHttp.get<FeishuUserInfoResponse>('/authen/v1/user_info', {
      headers: { Authorization: `Bearer ${userAccessToken}` },
    })

    const data = userResponse.data
    const feishuUser = data.data
    if (data.code !== 0 || !feishuUser?.open_id) {
      throw new UnauthorizedException(`获取飞书用户信息失败: ${data.msg || data.code}`)
    }

    return {
      name: feishuUser.name || feishuUser.en_name,
      avatar: feishuUser.avatar_url || feishuUser.avatar_big || feishuUser.avatar_middle || feishuUser.avatar_thumb,
      openId: feishuUser.open_id,
      unionId: feishuUser.union_id,
      email: this.normalizeOptionalEmail(feishuUser.enterprise_email || feishuUser.email),
      tenantKey: feishuUser.tenant_key,
    }
  }

  private async findAndBindFeishuUser(feishuUser: FeishuUserInfo) {
    const existingByFeishuId = await this.prisma.user.findFirst({
      where: {
        OR: [
          { feishuOpenId: feishuUser.openId },
          ...(feishuUser.unionId ? [{ feishuUnionId: feishuUser.unionId }] : []),
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        organizationId: true,
      },
    })

    if (existingByFeishuId) return existingByFeishuId

    if (!feishuUser.email) {
      return this.createFeishuProvisionedUser(feishuUser)
    }

    const user = await this.prisma.user.findUnique({
      where: { email: feishuUser.email },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        organizationId: true,
        feishuOpenId: true,
        feishuUnionId: true,
      },
    })

    if (!user) {
      return this.createFeishuProvisionedUser(feishuUser)
    }

    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        feishuOpenId: user.feishuOpenId || feishuUser.openId,
        feishuUnionId: user.feishuUnionId || feishuUser.unionId,
        feishuTenantKey: feishuUser.tenantKey,
        avatar: user.avatar || feishuUser.avatar,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        organizationId: true,
      },
    })
  }

  private async createFeishuProvisionedUser(feishuUser: FeishuUserInfo) {
    const displayName = feishuUser.name || feishuUser.email || '飞书用户'
    const organizationId = await this.resolveFeishuProvisioningOrganizationId()

    return this.prisma.user.create({
      data: {
        email: feishuUser.email,
        name: displayName,
        avatar: feishuUser.avatar,
        feishuOpenId: feishuUser.openId,
        feishuUnionId: feishuUser.unionId,
        feishuTenantKey: feishuUser.tenantKey,
        organizationId,
        role: Role.MEMBER,
        status: AccountStatus.ACTIVE,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        organizationId: true,
      },
    })
  }

  private async resolveFeishuProvisioningOrganizationId(): Promise<string | undefined> {
    const configuredOrganizationId = this.getFeishuDefaultOrganizationId()
    if (configuredOrganizationId) return configuredOrganizationId

    const activeOrganizations = await this.prisma.organization.findMany({
      where: { status: AccountStatus.ACTIVE },
      select: { id: true },
      take: 2,
      orderBy: { createdAt: 'asc' },
    })

    return activeOrganizations.length === 1 ? activeOrganizations[0].id : undefined
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

  /**
   * 刷新令牌
   * #2 修复: refresh 时将旧 token 存入 Redis 黑名单
   * 安全修复: 使用 token 的 SHA-256 hash 作为 Redis Key，避免明文存储
   */
  async refreshTokens(refreshToken: string) {
    try {
      const tokenHash = this.hashToken(refreshToken)

      // 检查旧 token 是否已在黑名单中
      const isBlacklisted = await this.redis.exists(`token:blacklist:${tokenHash}`)
      if (isBlacklisted) {
        throw new UnauthorizedException('刷新令牌已被吊销')
      }

      const payload = this.jwtService.verify(refreshToken, {
        secret: this.jwtRefreshSecret,
      })

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          status: true,
          organizationId: true,
        },
      })

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('无效的刷新令牌')
      }

      // 将旧 refresh token 的 hash 加入黑名单，TTL 跟随 refresh token 有效期。
      await this.redis.setWithTTL(
        `token:blacklist:${tokenHash}`,
        '1',
        durationToSeconds(this.jwtRefreshExpires, 365 * 24 * 60 * 60),
      )

      const tokens = await this.generateTokens(user.id, user.email, user.organizationId)
      return tokens
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error
      }
      throw new UnauthorizedException('刷新令牌已过期或无效')
    }
  }

  /**
   * #2 修复: 用户登出 — 将当前 refresh token 加入黑名单
   */
  async logout(refreshToken: string) {
    try {
      // 验证 token 有效性（不抛异常，只解析）
      this.jwtService.verify(refreshToken, {
        secret: this.jwtRefreshSecret,
      })
    } catch {
      // token 已过期也正常处理
    }

    // 无论如何都将 token 的 hash 加入黑名单
    const tokenHash = this.hashToken(refreshToken)
    await this.redis.setWithTTL(
      `token:blacklist:${tokenHash}`,
      '1',
      durationToSeconds(this.jwtRefreshExpires, 365 * 24 * 60 * 60),
    )
    this.logger.log('用户登出成功，refresh token 已吊销')
    return { success: true, message: '登出成功' }
  }

  /**
   * 生成 Access Token 和 Refresh Token
   */
  private async generateTokens(
    userId: string,
    email: string | null,
    organizationId?: string | null,
  ) {
    const payload = {
      sub: userId,
      email: email || undefined,
      organizationId: organizationId || undefined,
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: this.jwtAccessExpires,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.jwtRefreshSecret,
        expiresIn: this.jwtRefreshExpires,
      }),
    ])

    return { accessToken, refreshToken }
  }

  /**
   * 密码策略校验
   * #15 修复: 统一为 8 位
   * - 至少8个字符
   * - 包含大写字母
   * - 包含小写字母
   * - 包含数字
   */
  private validatePassword(password: string): void {
    const errors: string[] = []

    if (password.length < 8) {
      errors.push('密码长度不能少于8个字符')
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('密码必须包含至少一个大写字母')
    }
    if (!/[a-z]/.test(password)) {
      errors.push('密码必须包含至少一个小写字母')
    }
    if (!/[0-9]/.test(password)) {
      errors.push('密码必须包含至少一个数字')
    }

    if (errors.length > 0) {
      throw new ConflictException(errors.join('; '))
    }
  }

  /**
   * 为 Authing 登录的用户签发 JWT（供 AuthingService 回调使用）
   */
  async generateTokensForUser(user: {
    id: string
    email: string | null
    organizationId?: string | null
  }) {
    return this.generateTokens(user.id, user.email, user.organizationId)
  }

  /**
   * 获取当前用户资料
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    if (!user) {
      throw new UnauthorizedException('用户不存在')
    }

    return user
  }

  /**
   * 修改密码
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user || !user.password) {
      throw new UnauthorizedException('用户不存在或未设置密码')
    }

    const isOldValid = await bcrypt.compare(oldPassword, user.password)
    if (!isOldValid) {
      throw new UnauthorizedException('旧密码错误')
    }

    // 校验新密码策略
    this.validatePassword(newPassword)

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    })

    this.logger.log(`用户修改密码成功: ${userId}`)
    return { success: true, message: '密码修改成功' }
  }

  /**
   * 更新用户资料
   */
  async updateProfile(userId: string, data: { name?: string; avatar?: string; phone?: string }) {
    const updateData: Record<string, string> = {}
    if (data.name) updateData.name = data.name
    if (data.avatar) updateData.avatar = data.avatar
    if (data.phone) updateData.phone = data.phone

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    })

    this.logger.log(`用户资料更新: ${userId}`)
    return user
  }
}
