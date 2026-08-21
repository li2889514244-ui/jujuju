import { INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test, TestingModule } from '@nestjs/testing'
import * as bcrypt from 'bcryptjs'
import * as request from 'supertest'
import { AuthModule } from '../../src/modules/auth/auth.module'
import { PrismaService } from '../../src/prisma/prisma.service'
import { RedisService } from '../../src/redis/redis.service'
import { mockUsers } from '../fixtures'
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock'
import { mockRedisService, resetRedisMocks } from '../mocks/redis.mock'

const TEST_JWT_SECRET = 'test-jwt-secret-32-characters-minimum'
const TEST_REFRESH_SECRET = 'test-jwt-refresh-secret-32-characters'

describe('Auth Flow E2E', () => {
  let app: INestApplication
  let jwtService: JwtService

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || TEST_REFRESH_SECRET
    process.env.JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m'
    process.env.JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '365d'

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .compile()

    app = moduleFixture.createNestApplication()
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )

    jwtService = moduleFixture.get<JwtService>(JwtService)
    await app.init()
  })

  afterAll(async () => {
    await app.close()
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

  describe('POST /api/v1/auth/register', () => {
    it('keeps public registration closed', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'Test123456',
          name: 'new user',
          phone: '13800138000',
        })
        .expect(403)

      expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled()
      expect(mockPrismaService.user.create).not.toHaveBeenCalled()
    })

    it('still validates malformed register payloads before the closed-registration guard', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({ email: 'invalid-email' })
        .expect(400)
    })
  })

  describe('POST /api/v1/auth/login', () => {
    it('logs in with email and password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)
      mockPrismaService.user.update.mockResolvedValue(mockUsers.regular)

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'Test123456' })
        .expect(200)

      expect(response.body).toHaveProperty('user')
      expect(response.body).toHaveProperty('accessToken')
      expect(response.body).toHaveProperty('refreshToken')
    })

    it('logs in with phone and password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUsers.regular,
        phone: '13800138000',
      })
      mockPrismaService.user.update.mockResolvedValue(mockUsers.regular)

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: '13800138000', password: 'Test123456' })
        .expect(200)

      expect(response.body).toHaveProperty('accessToken')
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { phone: '13800138000' } }),
      )
    })

    it('rejects wrong, missing, and suspended users', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'wrongpassword' })
        .expect(401)

      mockPrismaService.user.findUnique.mockResolvedValue(null)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'missing@example.com', password: 'Test123456' })
        .expect(401)

      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.suspended)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'suspended@example.com', password: 'Test123456' })
        .expect(401)
    })
  })

  describe('POST /api/v1/auth/refresh', () => {
    it('refreshes a valid refresh token', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: TEST_REFRESH_SECRET, expiresIn: '365d' },
      )
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200)

      expect(response.body).toHaveProperty('accessToken')
      expect(response.body).toHaveProperty('refreshToken')
    })

    it('rejects expired and invalid refresh tokens', async () => {
      const expiredToken = jwtService.sign(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: TEST_REFRESH_SECRET, expiresIn: '0s' },
      )
      await new Promise((resolve) => setTimeout(resolve, 100))

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401)

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'completely-invalid-token' })
        .expect(401)
    })
  })

  describe('auth lifecycle', () => {
    it('supports login then refresh for an existing user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)
      mockPrismaService.user.update.mockResolvedValue(mockUsers.regular)

      const loginResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@example.com', password: 'Test123456' })
        .expect(200)

      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular)
      const refreshResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: loginResponse.body.refreshToken })
        .expect(200)

      expect(jwtService.decode(refreshResponse.body.accessToken)).toEqual(
        expect.objectContaining({ sub: mockUsers.regular.id, email: mockUsers.regular.email }),
      )
    })
  })
})
