import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateAccountDto } from './dto/create-account.dto'
import { UpdateAccountDto } from './dto/update-account.dto'
import { Platform } from '../../common/prisma-enums'
import { Prisma } from '@prisma/client'
import { OwnershipHelper } from '../../common/utils/ownership.helper'
import { PermissionService } from '../teams/permission.service'
import {
  decryptCookie as decryptCookieValue,
  encryptCookie as encryptCookieValue,
} from '../../common/utils/cookie-crypto'

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name)
  private readonly encryptionKey: string

  constructor(
    private prisma: PrismaService,
    private permissionService: PermissionService,
  ) {
    const key = process.env.COOKIE_ENCRYPTION_KEY
    if (!key || key.length < 32) {
      throw new Error(
        'FATAL: COOKIE_ENCRYPTION_KEY environment variable is required and must be at least 32 characters.',
      )
    }
    this.encryptionKey = key
  }

  private isSuspiciousAccountNickname(platform: unknown, nickname: unknown): boolean {
    if (typeof nickname !== 'string') return false
    const text = nickname.trim()
    if (!text) return false
    const lower = text.toLowerCase()
    if (
      [
        '视频号',
        '视频号助手',
        '微信',
        '抖音',
        '抖音创作者中心',
        '抖音创作服务平台',
        '快手',
        '快手创作者服务平台',
        '小红书',
        '小红书创作服务平台',
        '创作者中心',
        '创作者服务平台',
        '内容管理',
        '数据中心',
        '视频管理',
        '首页',
        '数据',
        '内容',
        '粉丝',
        '关注',
        '获赞',
        '账号',
        '平台',
        '扫码登录',
        '登录',
        '申请认证',
        '关注者',
        '昨日数据',
        // 页面 UI 模块/导航标题，绝不能被当作昵称
        '最近视频',
        '最近作品',
        '视频数据',
        '数据概览',
        '内容数据',
        '作品数据',
        '今日数据',
        '数据趋势',
        '热门视频',
        '视频列表',
        '作品列表',
        '全部视频',
        '全部作品',
        '视频明细',
        '粉丝数据',
        '观众数据',
        '直播数据',
        '商品数据',
        '订单数据',
        '账号概览',
        '内容洞察',
        '互动管理',
        '图文数据',
        '视频动态',
        '视频号动态',
        '作品发布',
        '发布作品',
        '发布高清视频',
        '发布全景视频',
        '发布图文',
        '发布文章',
        '智能创作',
        'AI分身',
        'AI工坊',
        '创作服务',
        '创作中心',
        '收入变现',
        '活动中心',
        '通知',
        '查看全部',
        '更多',
      ].includes(text)
    )
      return true
    if (
      [
        'douyin',
        'douyin creator center',
        'creator center',
        'creator service platform',
        'kuaishou',
        'xiaohongshu',
        'wechat',
        'video account',
        'login',
      ].includes(lower)
    )
      return true
    if (platform !== 'WECHAT_VIDEO') return false
    if (/^sph[A-Za-z0-9_-]{8,}$/.test(text)) return true
    return [
      '有限公司',
      '有限责任公司',
      '股份有限公司',
      '集团有限公司',
      '文化有限公司',
      '科技有限公司',
    ].some((marker) => text.includes(marker))
  }

  private isSafeAvatar(value: unknown): boolean {
    if (typeof value !== 'string') return false
    const text = value.trim()
    if (!text || text.length > 2000) return false
    let url: URL
    try {
      url = new URL(text)
    } catch {
      return false
    }
    if (!['http:', 'https:'].includes(url.protocol)) return false
    const host = url.hostname.toLowerCase()
    const path = url.pathname.toLowerCase()
    if (
      (host.endsWith('channels.weixin.qq.com') || host.endsWith('finder.video.qq.com')) &&
      (path === '/platform' || path.startsWith('/platform/'))
    )
      return false
    if (['/data-center', '/post/list', '/statistic/'].some((marker) => path.includes(marker)))
      return false
    const lower = text.toLowerCase()
    return (
      ['qlogo.cn', 'qpic.cn', 'headimg', 'douyinpic.com', 'byteimg.com', 'xhscdn.com', 'kuaishou.com', 'kwaicdn.com'].some(
        (marker) => host.includes(marker),
      ) ||
      ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'].some((ext) => path.endsWith(ext)) ||
      ['avatar', 'headimage', 'headimgurl'].some((marker) => lower.includes(marker))
    )
  }

  private isExpiringAvatar(value: unknown): boolean {
    if (typeof value !== 'string') return false
    const text = value.trim()
    if (!text) return false
    let url: URL
    try {
      url = new URL(text)
    } catch {
      return false
    }
    const host = url.hostname.toLowerCase()
    return (
      host.includes('douyinpic.com') ||
      host.includes('byteimg.com') ||
      url.searchParams.has('x-expires') ||
      url.searchParams.has('x-signature')
    )
  }

  /**
   * 修复: 加密Cookie — 使用 aes-256-gcm，每条记录独立随机IV
   */
  private encryptCookie(text: string): string {
    return encryptCookieValue(text, this.encryptionKey)
  }

  /**
   * 修复: 解密Cookie — 兼容旧 CBC 格式
   */
  private decryptCookie(text: string): string {
    return decryptCookieValue(text, this.encryptionKey)
  }

  private async setPrimaryOperator(accountId: string, userId: string) {
    await this.prisma.$transaction([
      this.prisma.accountOperator.updateMany({
        where: {
          accountId,
          role: 'PRIMARY',
          userId: { not: userId },
        },
        data: { role: 'COLLABORATOR' },
      }),
      this.prisma.accountOperator.upsert({
        where: { accountId_userId: { accountId, userId } },
        update: { role: 'PRIMARY' },
        create: { accountId, userId, role: 'PRIMARY' },
      }),
    ])
  }

  private async assertAccountManageAccess(accountId: string, userId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, userId: true, organizationId: true },
    })
    if (!account) {
      throw new NotFoundException('账号不存在')
    }
    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')
    return account
  }

  private async assertUsersInAccountOrganization(account: { organizationId: string | null }, userIds: string[]) {
    const ids = [...new Set(userIds.filter(Boolean))]
    if (!ids.length) return
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, organizationId: true },
    })
    if (users.length !== ids.length) {
      throw new NotFoundException('运营人员不存在')
    }
    const invalid = users.some((user) => user.organizationId !== account.organizationId)
    if (invalid) {
      throw new NotFoundException('运营人员不属于该账号组织')
    }
  }

  /**
   * 创建平台账号
   */
  async create(dto: CreateAccountDto, userId: string) {
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    })

    // 加密Cookie
    const encryptedCookies = dto.cookies ? this.encryptCookie(dto.cookies) : null
    const cookieSavedAt = encryptedCookies ? new Date() : undefined
    const nickname = this.isSuspiciousAccountNickname(dto.platform, dto.nickname)
      ? dto.platform === 'WECHAT_VIDEO'
        ? '视频号'
        : dto.platformUserId
      : dto.nickname
    const avatar =
      this.isSafeAvatar(dto.avatar) && !this.isExpiringAvatar(dto.avatar) ? dto.avatar : undefined
    if (dto.avatar && this.isExpiringAvatar(dto.avatar)) {
      this.logger.warn(`Ignored expiring avatar on account create: ${dto.platform} ${dto.platformUserId}`)
    }

    // upsert: update if same platform+userId exists, create if not
    const account = await this.prisma.account.upsert({
      where: {
        platform_platformUserId: {
          platform: dto.platform,
          platformUserId: dto.platformUserId,
        },
      },
      create: {
        platform: dto.platform,
        platformUserId: dto.platformUserId,
        nickname,
        avatar,
        bio: dto.bio,
        cookies: encryptedCookies,
        cookieSavedAt,
        proxyConfig: dto.proxyConfig ? JSON.stringify(dto.proxyConfig) : undefined,
        organizationId: user?.organizationId || null,
        teamId: dto.teamId,
        userId,
      },
      update: {
        ...(this.isSuspiciousAccountNickname(dto.platform, dto.nickname) ? {} : { nickname }),
        avatar,
        bio: dto.bio,
        cookies: encryptedCookies ?? undefined,
        ...(encryptedCookies ? { cookieSavedAt: new Date() } : {}),
        proxyConfig: dto.proxyConfig ? JSON.stringify(dto.proxyConfig) : undefined,
        organizationId: user?.organizationId || null,
        userId,
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
      },
    })

    await this.setPrimaryOperator(account.id, userId)
    this.logger.log(`账号创建成功: ${dto.platform} - ${dto.nickname} (${account.id})`)
    return this.sanitizeAccount(account)
  }

  /**
   * 获取账号列表
   * shared mode: 不按 userId 过滤，与 analytics service 保持一致
   */
  async findAll(params: {
    userId?: string
    teamId?: string
    groupId?: string
    platform?: Platform
    keyword?: string
    skip?: number
    take?: number
  }) {
    const { teamId, groupId, platform, keyword, skip = 0, take = 20 } = params

    const where: Prisma.AccountWhereInput = {}
    if (teamId) where.teamId = teamId
    if (groupId) where.groupId = groupId
    if (platform) where.platform = platform
    if (keyword) {
      where.nickname = { contains: keyword, mode: 'insensitive' }
    }

    const [accounts, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        skip,
        take,
        include: {
          owner: {
            select: { id: true, name: true, email: true },
          },
          team: {
            select: { id: true, name: true },
          },
          operators: {
            include: {
              user: { select: { id: true, name: true, email: true, avatar: true } },
            },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          },
          _count: {
            select: { posts: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.account.count({ where }),
    ])

    return {
      accounts: accounts.map((a) => this.sanitizeAccount(a)),
      total,
      skip,
      take,
    }
  }

  /**
   * 修复: 获取账号详情 — 添加 userId 跨租户隔离校验
   */
  async findById(id: string, userId?: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
        operators: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
        posts: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            status: true,
            publishAt: true,
            createdAt: true,
          },
        },
        _count: {
          select: { posts: true },
        },
      },
    })

    if (!account) {
      throw new NotFoundException('账号不存在')
    }

    // 跨租户隔离 — 非管理员只能查看自己的账号
    if (userId) {
      await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')
    }

    return this.sanitizeAccount(account)
  }

  /**
   * 更新账号信息
   */
  async update(id: string, dto: UpdateAccountDto, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } })
    if (!account) {
      throw new NotFoundException('账号不存在')
    }

    // 权限检查：只有账号所有者或管理员可以修改
    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')

    const updateData: Prisma.AccountUpdateInput = { ...dto }
    if (this.isSuspiciousAccountNickname(account.platform, dto.nickname)) {
      delete updateData.nickname
      this.logger.warn(`Ignored suspicious ${account.platform} nickname update "${dto.nickname}" for ${id}`)
    }
    if (dto.avatar !== undefined && (!this.isSafeAvatar(dto.avatar) || this.isExpiringAvatar(dto.avatar))) {
      delete updateData.avatar
      this.logger.warn(`Ignored suspicious avatar update "${dto.avatar}" for ${id}`)
    }

    // 如果更新Cookie，需要加密，并更新保存时间戳
    if (dto.cookies) {
      updateData.cookies = this.encryptCookie(dto.cookies)
      updateData.cookieSavedAt = new Date()
    }

    const updated = await this.prisma.account.update({
      where: { id },
      data: updateData,
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        team: {
          select: { id: true, name: true },
        },
        operators: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    return this.sanitizeAccount(updated)
  }

  async getOperators(accountId: string, userId: string) {
    await this.findById(accountId, userId)
    const operators = await this.prisma.accountOperator.findMany({
      where: { accountId },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true, role: true } },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    })
    return {
      operators: operators.map((operator) => ({
        id: operator.id,
        accountId: operator.accountId,
        userId: operator.userId,
        role: operator.role,
        user: operator.user,
      })),
    }
  }

  async updateOperators(
    accountId: string,
    dto: { primaryUserId: string; collaboratorUserIds?: string[] },
    userId: string,
  ) {
    const account = await this.assertAccountManageAccess(accountId, userId)
    const primaryUserId = String(dto.primaryUserId || '').trim()
    if (!primaryUserId) {
      throw new NotFoundException('请选择主负责人')
    }
    const collaboratorUserIds = [
      ...new Set((dto.collaboratorUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)),
    ].filter((id) => id !== primaryUserId)
    await this.assertUsersInAccountOrganization(account, [primaryUserId, ...collaboratorUserIds])

    const keepUserIds = [primaryUserId, ...collaboratorUserIds]
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: accountId },
        data: { userId: primaryUserId },
      })
      await tx.accountOperator.deleteMany({
        where: {
          accountId,
          userId: { notIn: keepUserIds },
        },
      })
      await tx.accountOperator.updateMany({
        where: {
          accountId,
          role: 'PRIMARY',
          userId: { not: primaryUserId },
        },
        data: { role: 'COLLABORATOR' },
      })
      await tx.accountOperator.upsert({
        where: { accountId_userId: { accountId, userId: primaryUserId } },
        update: { role: 'PRIMARY' },
        create: { accountId, userId: primaryUserId, role: 'PRIMARY' },
      })
      for (const collaboratorUserId of collaboratorUserIds) {
        await tx.accountOperator.upsert({
          where: { accountId_userId: { accountId, userId: collaboratorUserId } },
          update: { role: 'COLLABORATOR' },
          create: { accountId, userId: collaboratorUserId, role: 'COLLABORATOR' },
        })
      }
    })

    return this.getOperators(accountId, primaryUserId)
  }

  async checkSessionStatus(id: string, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } })
    if (!account) {
      throw new NotFoundException('账号不存在')
    }

    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')
    await this.permissionService.assertUserPermission(userId, 'manage_browser')

    let hasCookies = false
    let count = 0
    if (account.cookies) {
      try {
        const cookies = this.decryptCookie(account.cookies)
        hasCookies = typeof cookies === 'string' && cookies.trim().length > 0
        if (hasCookies) {
          try {
            const parsed = JSON.parse(cookies)
            count = Array.isArray(parsed) ? parsed.length : 1
          } catch {
            count = 1
          }
        }
      } catch {
        this.logger.warn(`Cookie decrypt failed while checking session: accountId=${id}`)
      }
    }

    const online = this.deriveOnlineStatus({ ...account, cookies: hasCookies ? account.cookies : null })
    return {
      status: hasCookies ? 'valid' : 'missing',
      count,
      ...online,
    }
  }

  /**
   * 删除账号
   */
  async remove(id: string, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } })
    if (!account) {
      throw new NotFoundException('账号不存在')
    }

    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')

    // 级联删除关联数据
    await this.prisma.$transaction([
      this.prisma.postStats.deleteMany({ where: { post: { accountId: id } } }),
      this.prisma.post.deleteMany({ where: { accountId: id } }),
      this.prisma.dailyStats.deleteMany({ where: { accountId: id } }),
      this.prisma.account.delete({ where: { id } }),
    ])
    this.logger.log(`账号已删除: ${id}`)
    return { success: true }
  }

  /**
   * 将账号移动到指定分组
   */
  async moveToGroup(accountId: string, groupId: string | null, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      throw new NotFoundException('账号不存在')
    }

    // 权限校验
    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')

    // 验证分组归属
    if (groupId) {
      const group = await this.prisma.accountGroup.findFirst({
        where: { id: groupId, userId },
      })
      if (!group) {
        throw new NotFoundException('分组不存在或无权操作')
      }
    }

    const updated = await this.prisma.account.update({
      where: { id: accountId },
      data: { groupId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        team: { select: { id: true, name: true } },
        group: { select: { id: true, name: true, color: true } },
        operators: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        },
      },
    })

    this.logger.log(`账号 ${account.nickname} 移动到分组 ${groupId ?? '未分组'}`)
    return this.sanitizeAccount(updated)
  }

  async bulkMoveToGroup(accountIds: string[], groupId: string | null, userId: string) {
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')
    const ids = Array.isArray(accountIds) ? [...new Set(accountIds.filter(Boolean))] : []
    if (ids.length === 0) return { success: true, count: 0 }

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: ids } },
      select: { id: true, userId: true },
    })
    for (const account of accounts) {
      await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')
    }

    if (groupId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      })
      const group = await this.prisma.accountGroup.findFirst({
        where: {
          id: groupId,
          OR: [{ userId }, ...(user?.organizationId ? [{ organizationId: user.organizationId }] : [])],
        },
      })
      if (!group) {
        throw new NotFoundException('分组不存在或无权操作')
      }
    }

    const result = await this.prisma.account.updateMany({
      where: { id: { in: accounts.map((account) => account.id) } },
      data: { groupId },
    })
    return { success: true, count: result.count }
  }

  /**
   * 获取账号Cookie（解密）
   */
  async getCookies(id: string, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id } })
    if (!account) {
      throw new NotFoundException('账号不存在')
    }

    await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号')
    await this.permissionService.assertUserPermission(userId, 'manage_browser')

    if (!account.cookies) {
      return { cookies: null }
    }

    try {
      return { cookies: this.decryptCookie(account.cookies) }
    } catch {
      this.logger.warn(`Cookie decrypt failed: accountId=${id}`)
      return { cookies: null }
    }
  }

  /**
   * 脱敏处理：隐藏Cookie字段
   */
  private sanitizeAccount(account: any) {
    const { cookies, operators, ...rest } = account
    const sanitizedOperators = Array.isArray(operators)
      ? operators.map((operator) => ({
          id: operator.id,
          accountId: operator.accountId,
          userId: operator.userId,
          role: operator.role,
          user: operator.user,
        }))
      : []
    const primaryOperator =
      sanitizedOperators.find((operator) => operator.role === 'PRIMARY') ||
      (rest.owner
        ? {
            id: '',
            accountId: rest.id,
            userId: rest.owner.id,
            role: 'PRIMARY',
            user: rest.owner,
          }
        : null)
    const collaboratorOperators = sanitizedOperators.filter(
      (operator) => operator.role === 'COLLABORATOR',
    )
    return {
      ...rest,
      operators: sanitizedOperators,
      primaryOperator,
      collaboratorOperators,
      operatorCount: sanitizedOperators.length || (primaryOperator ? 1 : 0),
      hasCookies: !!cookies,
      ...this.deriveOnlineStatus(account),
    }
  }

  private deriveOnlineStatus(account: any) {
    const metadata = this.parseJsonObject(account?.metadata)
    const companionSession = this.parseJsonObject(metadata.companionSession)
    const companionStatus = String(companionSession.status || '').toLowerCase()
    if (companionStatus === 'online') {
      return {
        online: true,
        onlineStatus: 'online',
        onlineLabel: '在线',
        onlineReason: companionSession.reason || '伴侣实测在线',
      }
    }
    if (companionStatus === 'offline' || companionStatus === 'blocked') {
      return {
        online: false,
        onlineStatus: 'offline',
        onlineLabel: '离线',
        onlineReason: companionSession.reason || (companionStatus === 'blocked' ? '伴侣检测到验证阻断' : '伴侣实测离线'),
      }
    }

    const status = String(account?.status || '').toUpperCase()
    if (status === 'EXPIRED' || status === 'DISABLED') {
      return {
        online: false,
        onlineStatus: 'offline',
        onlineLabel: '离线',
        onlineReason: status === 'DISABLED' ? '账号已禁用' : '登录态已失效',
      }
    }

    const now = Date.now()
    const lastActiveAt = account?.lastActiveAt ? new Date(account.lastActiveAt).getTime() : 0
    const activeRecently =
      lastActiveAt > 0 && Number.isFinite(lastActiveAt) && now - lastActiveAt <= 7 * 24 * 60 * 60 * 1000

    if (activeRecently) {
      return {
        online: true,
        onlineStatus: 'online',
        onlineLabel: '在线',
        onlineReason: '近期伴侣采集成功',
      }
    }

    return {
      online: false,
      onlineStatus: 'offline',
      onlineLabel: '离线',
      onlineReason: '伴侣尚未完成实测',
    }
  }

  private parseJsonObject(value: unknown): Record<string, any> {
    if (!value) return {}
    if (typeof value === 'object') return value as Record<string, any>
    if (typeof value !== 'string') return {}
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
}
