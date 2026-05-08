/**
 * 完整认证流程 E2E 测试
 * 测试从注册到 Token 刷新的完整认证生命周期
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockUsers } from '../fixtures';
import * as bcrypt from 'bcryptjs';

describe('Auth Flow E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    resetPrismaMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    jwtService = moduleFixture.get<JwtService>(JwtService);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetPrismaMocks();
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$10$hashed' as never);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 注册流程测试 ====================

  describe('POST /api/v1/auth/register', () => {
    it('应成功注册新用户', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-new',
        email: 'newuser@example.com',
        name: '新用户',
        phone: '13800138000',
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'Test123456',
          name: '新用户',
          phone: '13800138000',
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user.email).toBe('newuser@example.com');
    });

    it('重复邮箱注册应返回 409', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123456',
          name: '重复用户',
        })
        .expect(409);
    });

    it('缺少必填字段应返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'test@example.com',
          // 缺少 password 和 name
        })
        .expect(400);
    });

    it('无效邮箱格式应返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'Test123456',
          name: '测试用户',
        })
        .expect(400);
    });
  });

  // ==================== 登录流程测试 ====================

  describe('POST /api/v1/auth/login', () => {
    it('应成功登录', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      mockPrismaService.user.update.mockResolvedValue(mockUsers.regular);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test123456',
        })
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('错误密码应返回 401', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });

    it('不存在的用户应返回 401', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test123456',
        })
        .expect(401);
    });

    it('被禁用的用户应返回 401', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.suspended);

      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'suspended@example.com',
          password: 'Test123456',
        })
        .expect(401);
    });
  });

  // ==================== Token 刷新流程测试 ====================

  describe('POST /api/v1/auth/refresh', () => {
    it('应使用有效的 Refresh Token 获取新的 Token 对', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: 'test-jwt-refresh-secret', expiresIn: '7d' },
      );

      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('过期的 Refresh Token 应返回 401', async () => {
      const expiredToken = jwtService.sign(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: 'test-jwt-refresh-secret', expiresIn: '0s' },
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: expiredToken })
        .expect(401);
    });

    it('无效的 Token 应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'completely-invalid-token' })
        .expect(401);
    });
  });

  // ==================== 完整认证流程测试 ====================

  describe('完整认证生命周期', () => {
    it('应支持 注册 -> 登录 -> 刷新Token 的完整流程', async () => {
      // 1. 注册
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-e2e',
        email: 'e2e@example.com',
        name: 'E2E用户',
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'e2e@example.com',
          password: 'Test123456',
          name: 'E2E用户',
        })
        .expect(201);

      const { refreshToken: registerRefreshToken } = registerResponse.body;

      // 2. 使用 Refresh Token 获取新 Token
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUsers.regular,
        id: 'user-e2e',
        email: 'e2e@example.com',
      });

      const refreshResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: registerRefreshToken })
        .expect(200);

      expect(refreshResponse.body).toHaveProperty('accessToken');
      expect(refreshResponse.body).toHaveProperty('refreshToken');

      // 3. 验证新 Token 的 payload
      const payload = jwtService.decode(refreshResponse.body.accessToken) as any;
      expect(payload.sub).toBe('user-e2e');
      expect(payload.email).toBe('e2e@example.com');
    });
  });
});
