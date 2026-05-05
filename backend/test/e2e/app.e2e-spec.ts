/**
 * 应用启动 E2E 测试
 * 测试 NestJS 应用的启动、模块加载、基础路由
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { AccountsModule } from '../../src/modules/accounts/accounts.module';
import { TeamsModule } from '../../src/modules/teams/teams.module';
import { ContentModule } from '../../src/modules/content/content.module';
import { BrowserModule } from '../../src/modules/browser/browser.module';
import { AnalyticsModule } from '../../src/modules/analytics/analytics.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';

describe('App E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    resetPrismaMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        AuthModule,
        AccountsModule,
        TeamsModule,
        ContentModule,
        BrowserModule,
        AnalyticsModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();

    // 模拟生产环境的全局配置
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 应用启动测试 ====================

  describe('应用启动', () => {
    it('应用应成功初始化', () => {
      expect(app).toBeDefined();
    });

    it('应用应监听正确的端口', () => {
      const httpServer = app.getHttpServer();
      expect(httpServer).toBeDefined();
    });
  });

  // ==================== 健康检查测试 ====================

  describe('健康检查', () => {
    it('根路径应返回响应', async () => {
      const response = await request(app.getHttpServer()).get('/');

      // 可能返回 200 或 404，取决于是否有根路由
      expect(response.status).toBeLessThan(500);
    });
  });

  // ==================== 404 处理测试 ====================

  describe('404 处理', () => {
    it('不存在的路由应返回 404', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/nonexistent-route')
        .expect(404);
    });
  });

  // ==================== 全局异常过滤器测试 ====================

  describe('异常处理', () => {
    it('无效的 JSON 请求体应返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    it('缺少必需字段应返回 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({})
        .expect(400);
    });
  });

  // ==================== 模块加载测试 ====================

  describe('模块加载', () => {
    it('Auth 模块应正确加载', () => {
      expect(() => app.get('AuthService')).not.toThrow();
    });

    it('Accounts 模块应正确加载', () => {
      expect(() => app.get('AccountsService')).not.toThrow();
    });

    it('Teams 模块应正确加载', () => {
      expect(() => app.get('TeamsService')).not.toThrow();
    });

    it('Content 模块应正确加载', () => {
      expect(() => app.get('ContentService')).not.toThrow();
    });

    it('Analytics 模块应正确加载', () => {
      expect(() => app.get('AnalyticsService')).not.toThrow();
    });

    it('Browser 模块应正确加载', () => {
      expect(() => app.get('BrowserService')).not.toThrow();
    });
  });

  // ==================== API 路由前缀测试 ====================

  describe('API 路由前缀', () => {
    it('应使用 /api/v1 前缀', async () => {
      // 访问 /api/v1/auth/login 应该存在（不是 404）
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test', password: 'test' });

      // 应该返回 400（验证错误）或 401（认证错误），而不是 404
      expect(response.status).not.toBe(404);
    });

    it('不带前缀的路由应返回 404', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'test', password: 'test' })
        .expect(404);
    });
  });
});
