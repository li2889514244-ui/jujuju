import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import * as bcrypt from 'bcryptjs'
import { AuthController } from '../../src/modules/auth/auth.controller'
import { AuthService } from '../../src/modules/auth/auth.service'
import { PrismaService } from '../../src/prisma/prisma.service'
import { RedisService } from '../../src/redis/redis.service'
import { mockUsers } from '../fixtures'
import { createMockConfigService } from '../helpers/test-helpers'
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock'
import { mockRedisService, resetRedisMocks } from '../mocks/redis.mock'

const TEST_REFRESH_SECRET = 'test-jwt-refresh-secret-32-characters'

describe('Auth integration', () => {
  let authService: AuthService
  let authController: AuthController
  let jwtService: JwtService

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        JwtService,
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile()

    authService = module.get<AuthService>(AuthService)
    authService.onModuleInit()
    authController = module.get<AuthController>(AuthController)
    jwtService = module.get<JwtService>(JwtService)
  })

  beforeEach(() => {
    resetPrismaMocks()
    resetRedisMocks()
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$10$hashed' as never)
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('public registration', () => {
    it('is closed through the controller and does not create users', async () => {
      await expect(
        authController.register({
          email: 'new@example.com',
          password: 'Test123456',
          name: 'new user',
          phone: '13800138000',
        }),
      ).rejects.toThrow(ForbiddenException)

      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled()
      expect(mockPrismaService.user.create).not.toHaveBeenCalled()
    })
  })

  describe('login flow', () => {
    it('logs in through the controller', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)
      mockPrismaService.user.update.mockResolvedValue(mockUsers.regular)

      const result = await authController.login({
        email: 'test@example.com',
        password: 'Test123456',
      })

      expect(result).toHaveProperty('user')
      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
    })

    it('rejects bad passwords', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)

      await expect(
        authController.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException)
    })
  })

  describe('refresh flow', () => {
    it('refreshes a valid token through the controller', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: TEST_REFRESH_SECRET, expiresIn: '365d' },
      )
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)

      const result = await authController.refresh({ refreshToken })

      expect(result).toHaveProperty('accessToken')
      expect(result).toHaveProperty('refreshToken')
      expect(result.refreshToken).not.toBe(refreshToken)
    })

    it('supports login then refresh for an existing user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)
      mockPrismaService.user.update.mockResolvedValue(mockUsers.regular)

      const loginResult = await authService.login({
        email: 'test@example.com',
        password: 'Test123456',
      })

      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)
      const refreshResult = await authService.refreshTokens(loginResult.refreshToken)

      expect(refreshResult.accessToken).toBeDefined()
      expect(refreshResult.refreshToken).toBeDefined()
      expect(jwtService.decode(refreshResult.accessToken)).toEqual(
        expect.objectContaining({ sub: mockUsers.regular.id, email: mockUsers.regular.email }),
      )
    })

    it('rejects suspended users during refresh', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.suspended.id, email: mockUsers.suspended.email },
        { secret: TEST_REFRESH_SECRET, expiresIn: '365d' },
      )
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.suspended)

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException)
    })
  })
})
