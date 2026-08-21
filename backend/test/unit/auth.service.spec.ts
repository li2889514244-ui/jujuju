import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import * as bcrypt from 'bcryptjs'
import { AuthService } from '../../src/modules/auth/auth.service'
import { PrismaService } from '../../src/prisma/prisma.service'
import { RedisService } from '../../src/redis/redis.service'
import { mockUsers } from '../fixtures'
import { createMockConfigService } from '../helpers/test-helpers'
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock'
import { mockRedisService, resetRedisMocks } from '../mocks/redis.mock'

const TEST_REFRESH_SECRET = 'test-jwt-refresh-secret-32-characters'
const mockFeishuHttp = {
  post: jest.fn(),
  get: jest.fn(),
}

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => mockFeishuHttp),
  },
}))

describe('AuthService', () => {
  let service: AuthService
  let prisma: typeof mockPrismaService
  let jwtService: JwtService
  let configService: ConfigService

  beforeEach(async () => {
    resetPrismaMocks()
    resetRedisMocks()
    mockFeishuHttp.post.mockReset()
    mockFeishuHttp.get.mockReset()
    const config = createMockConfigService({
      FEISHU_LOGIN_APP_ID: 'cli_test',
      FEISHU_LOGIN_APP_SECRET: 'feishu-secret',
      FEISHU_LOGIN_REDIRECT_URI: 'https://example.com/login',
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        JwtService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile()

    service = module.get<AuthService>(AuthService)
    service.onModuleInit()
    prisma = mockPrismaService
    jwtService = module.get<JwtService>(JwtService)
    configService = module.get<ConfigService>(ConfigService)

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$10$hashedpassword' as never)
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('register', () => {
    it('keeps public registration closed and does not create users', async () => {
      await expect(
        service.register({
          email: 'newuser@example.com',
          password: 'Test123456',
          name: 'new user',
          phone: '13800138000',
        }),
      ).rejects.toThrow(ForbiddenException)

      expect(prisma.user.findUnique).not.toHaveBeenCalled()
      expect(prisma.user.create).not.toHaveBeenCalled()
      expect(bcrypt.hash).not.toHaveBeenCalled()
    })
  })

  describe('login', () => {
    it('logs in with email and password', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular)
      prisma.user.update.mockResolvedValue(mockUsers.regular)

      const result = await service.login({ email: 'test@example.com', password: 'Test123456' })

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'test@example.com' } }),
      )
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUsers.regular.id },
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        }),
      )
      expect(result.user.email).toBe('test@example.com')
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result.user).not.toHaveProperty('password')
    })

    it('logs in with phone and password', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUsers.regular, phone: '13800138000' })
      prisma.user.update.mockResolvedValue(mockUsers.regular)

      const result = await service.login({ identifier: '13800138000', password: 'Test123456' })

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { phone: '13800138000' } }),
      )
      expect(result).toHaveProperty('accessToken')
    })

    it('rejects wrong passwords and missing users', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular)
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException)

      prisma.user.findUnique.mockResolvedValue(null)
      await expect(
        service.login({ email: 'missing@example.com', password: 'Test123456' }),
      ).rejects.toThrow(UnauthorizedException)
    })

    it('rejects suspended users', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.suspended)

      await expect(
        service.login({ email: 'suspended@example.com', password: 'Test123456' }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('validateUser', () => {
    it('validates email credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular)

      const result = await service.validateUser('test@example.com', 'Test123456')

      expect(result!.id).toBe(mockUsers.regular.id)
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'test@example.com' } }),
      )
    })

    it('validates phone credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUsers.regular, phone: '13800138000' })

      const result = await service.validateUser('13800138000', 'Test123456')

      expect(result).toBeDefined()
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { phone: '13800138000' } }),
      )
    })

    it('returns null for missing users or bad passwords', async () => {
      prisma.user.findUnique.mockResolvedValue(null)
      await expect(service.validateUser('missing@example.com', 'Test123456')).resolves.toBeNull()

      prisma.user.findUnique.mockResolvedValue(mockUsers.regular)
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
      await expect(service.validateUser('test@example.com', 'bad')).resolves.toBeNull()
    })
  })

  describe('feishu login', () => {
    it('generates a Feishu authorization URL and stores state with TTL', async () => {
      const result = await service.getFeishuAuthUrl('/accounts')

      expect(result.url).toContain('https://accounts.feishu.cn/open-apis/authen/v1/index')
      expect(result.url).toContain('app_id=cli_test')
      expect(result.url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Flogin')
      expect(result.url).toContain('state=')
      expect(mockRedisService.setWithTTL).toHaveBeenCalledWith(
        `feishu:oauth:state:${result.state}`,
        '1',
        300,
      )
    })

    it('rejects Feishu authorization URL generation when config is missing', async () => {
      ;(configService.get as jest.Mock).mockImplementation((key: string, defaultValue?: string) => {
        if (key.startsWith('FEISHU_LOGIN_')) return ''
        return createMockConfigService().get(key, defaultValue)
      })

      await expect(service.getFeishuAuthUrl()).rejects.toThrow(BadRequestException)
    })

    it('binds an existing email user and returns local tokens after Feishu callback', async () => {
      const { state } = await service.getFeishuAuthUrl('/content-insights')
      mockRedisService.exists.mockResolvedValue(true)
      mockFeishuHttp.post.mockResolvedValueOnce({
        data: { code: 0, msg: 'ok', access_token: 'user-token' },
      })
      mockFeishuHttp.get.mockResolvedValue({
        data: {
          code: 0,
          msg: 'ok',
          data: {
            open_id: 'ou_test',
            union_id: 'on_test',
            enterprise_email: 'test@example.com',
            tenant_key: 'tenant-test',
            avatar_url: 'https://example.com/avatar.png',
          },
        },
      })
      prisma.user.findFirst.mockResolvedValue(null)
      prisma.user.findUnique.mockResolvedValue({ ...mockUsers.regular, feishuOpenId: null, feishuUnionId: null })
      prisma.user.update
        .mockResolvedValueOnce({ ...mockUsers.regular, avatar: 'https://example.com/avatar.png' })
        .mockResolvedValueOnce(mockUsers.regular)

      const result = await service.loginWithFeishu('auth-code', state)

      expect(mockRedisService.del).toHaveBeenCalledWith(`feishu:oauth:state:${state}`)
      expect(mockFeishuHttp.post).toHaveBeenNthCalledWith(
        1,
        '/authen/v2/oauth/token',
        {
          grant_type: 'authorization_code',
          client_id: 'cli_test',
          client_secret: 'feishu-secret',
          code: 'auth-code',
          redirect_uri: 'https://example.com/login',
        },
      )
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            feishuOpenId: 'ou_test',
            feishuUnionId: 'on_test',
            feishuTenantKey: 'tenant-test',
          }),
        }),
      )
      expect(result.user.email).toBe('test@example.com')
      expect(result.redirect).toBe('/content-insights')
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('rejects Feishu callback when state is missing or expired', async () => {
      mockRedisService.exists.mockResolvedValue(false)

      await expect(service.loginWithFeishu('auth-code', 'expired-state')).rejects.toThrow(
        UnauthorizedException,
      )
      expect(mockFeishuHttp.post).not.toHaveBeenCalled()
    })

    it('auto-provisions Feishu users that do not match an existing system account', async () => {
      const { state } = await service.getFeishuAuthUrl('/dashboard')
      mockRedisService.exists.mockResolvedValue(true)
      mockFeishuHttp.post.mockResolvedValueOnce({
        data: { code: 0, msg: 'ok', data: { access_token: 'user-token' } },
      })
      mockFeishuHttp.get.mockResolvedValue({
        data: {
          code: 0,
          msg: 'ok',
          data: { open_id: 'ou_unknown', enterprise_email: 'unknown@example.com' },
        },
      })
      prisma.user.findFirst.mockResolvedValue(null)
      prisma.user.findUnique.mockResolvedValue(null)
      prisma.organization.findMany.mockResolvedValue([{ id: 'org-001' }])
      prisma.user.create.mockResolvedValue({
        ...mockUsers.regular,
        id: 'feishu-user-001',
        email: 'unknown@example.com',
        name: '飞书用户',
        organizationId: 'org-001',
      })

      const result = await service.loginWithFeishu('auth-code', state)

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'unknown@example.com',
            feishuOpenId: 'ou_unknown',
            organizationId: 'org-001',
            role: 'MEMBER',
            status: 'ACTIVE',
          }),
        }),
      )
      expect(result.user.id).toBe('feishu-user-001')
      expect(result).toHaveProperty('accessToken')
    })
  })

  describe('refreshTokens', () => {
    it('returns a new token pair for a valid refresh token', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: TEST_REFRESH_SECRET, expiresIn: '365d' },
      )
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular)

      const result = await service.refreshTokens(refreshToken)

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result.refreshToken).not.toBe(refreshToken)
      expect(mockRedisService.setWithTTL).toHaveBeenCalled()
    })

    it('rejects expired or invalid refresh tokens', async () => {
      const expiredToken = jwtService.sign(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: TEST_REFRESH_SECRET, expiresIn: '0s' },
      )
      await new Promise((resolve) => setTimeout(resolve, 100))

      await expect(service.refreshTokens(expiredToken)).rejects.toThrow(UnauthorizedException)
      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(UnauthorizedException)
    })

    it('rejects refresh for suspended or missing users', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.suspended.id, email: mockUsers.suspended.email },
        { secret: TEST_REFRESH_SECRET, expiresIn: '365d' },
      )

      prisma.user.findUnique.mockResolvedValue(mockUsers.suspended)
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException)

      prisma.user.findUnique.mockResolvedValue(null)
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('generateTokensForUser', () => {
    it('generates access and refresh tokens with the expected payload', async () => {
      const result = await service.generateTokensForUser({
        id: 'user-new',
        email: 'new@example.com',
        organizationId: null,
      })

      expect(result.accessToken).not.toBe(result.refreshToken)
      expect(jwtService.decode(result.accessToken)).toEqual(
        expect.objectContaining({ sub: 'user-new', email: 'new@example.com' }),
      )
      expect(jwtService.decode(result.refreshToken)).toEqual(
        expect.objectContaining({ sub: 'user-new', email: 'new@example.com' }),
      )
    })
  })
})
