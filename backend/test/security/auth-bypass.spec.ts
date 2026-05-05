import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * 认证绕过测试
 * 
 * 验证系统无法通过各种方式绕过认证：
 * - 无Token访问
 * - 伪造Token
 * - 过期Token
 * - 篡改Token
 * - 空Token
 */
describe('认证绕过测试 (Security)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

  // 需要认证的端点列表
  const PROTECTED_ENDPOINTS = [
    { method: 'get', path: '/api/v1/users/me' },
    { method: 'get', path: '/api/v1/accounts' },
    { method: 'post', path: '/api/v1/accounts' },
    { method: 'get', path: '/api/v1/content' },
    { method: 'post', path: '/api/v1/content' },
    { method: 'get', path: '/api/v1/teams' },
    { method: 'get', path: '/api/v1/users' },
  ];

  describe('无Token访问', () => {
    PROTECTED_ENDPOINTS.forEach(({ method, path }) => {
      it(`${method.toUpperCase()} ${path} 无Token应返回401`, async () => {
        const response = await (request(app.getHttpServer()) as any)
          [method](path);

        expect(response.status).toBe(401);
      });
    });
  });

  describe('伪造Token', () => {
    const FAKE_TOKENS = [
      'fake-jwt-token',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
      'Bearer fake',
      'null',
      'undefined',
      '',
      'admin',
      '{}',
    ];

    FAKE_TOKENS.forEach((token) => {
      it(`应拒绝伪造Token: "${token.substring(0, 30)}..."`, async () => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
      });
    });
  });

  describe('过期Token', () => {
    it('应拒绝过期的JWT Token', async () => {
      // 这是一个已过期的JWT（exp设置在过去）
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIiwiZW1haWwiOiJ0ZXN0QHRlc3QuY29tIiwiaWF0IjoxNjAwMDAwMDAwLCJleHAiOjE2MDAwMDAwMDF9.invalid-signature';

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('篡改Token', () => {
    let validToken: string;

    beforeAll(async () => {
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'test@matrixflow.com', password: 'Test123!' });
        validToken = res.body?.data?.accessToken;
      } catch {
        validToken = null;
      }
    });

    it('应拒绝修改了payload的Token', async () => {
      if (!validToken) return;

      const parts = validToken.split('.');
      if (parts.length === 3) {
        // 修改payload中的sub字段
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        payload.sub = 'admin-user-id';
        payload.role = 'OWNER';
        const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${tamperedToken}`);

        expect(response.status).toBe(401);
      }
    });

    it('应拒绝修改了header的Token', async () => {
      if (!validToken) return;

      const parts = validToken.split('.');
      if (parts.length === 3) {
        // 尝试切换到none算法
        const header = { alg: 'none', typ: 'JWT' };
        const tamperedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const tamperedToken = `${tamperedHeader}.${parts[1]}.`;

        const response = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${tamperedToken}`);

        expect(response.status).toBe(401);
      }
    });

    it('应拒绝截断的Token', async () => {
      if (!validToken) return;

      const truncatedToken = validToken.substring(0, validToken.length / 2);

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${truncatedToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Token注入攻击', () => {
    it('应拒绝在Authorization头中注入额外内容', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer token1, Bearer token2');

      expect(response.status).toBe(401);
    });

    it('应拒绝Basic认证替代Bearer', async () => {
      const credentials = Buffer.from('admin:password').toString('base64');

      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Basic ${credentials}`);

      expect(response.status).toBe(401);
    });

    it('应拒绝在URL参数中传递Token', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me?token=fake-token');

      expect(response.status).toBe(401);
    });
  });

  describe('禁用用户访问', () => {
    it('被禁用的用户不应能访问系统', async () => {
      // 模拟被禁用用户的Token
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'disabled@matrixflow.com',
          password: 'Test123!',
        });

      // 应返回401或403
      if (response.status === 200) {
        // 如果登录成功，用该token访问应被拒绝
        const token = response.body?.data?.accessToken;
        const protectedResponse = await request(app.getHttpServer())
          .get('/api/v1/users/me')
          .set('Authorization', `Bearer ${token}`);

        // 被禁用用户应返回403
        expect([401, 403]).toContain(protectedResponse.status);
      }
    });
  });

  describe('密码暴力破解防护', () => {
    it('多次错误登录应触发限流', async () => {
      const attempts = [];

      for (let i = 0; i < 10; i++) {
        attempts.push(
          request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({
              email: 'bruteforce@test.com',
              password: `wrong-password-${i}`,
            })
        );
      }

      const responses = await Promise.all(attempts);
      const rateLimited = responses.some((r) => r.status === 429);

      // 应有请求被限流
      expect(rateLimited).toBe(true);
    });
  });

  describe('公开端点验证', () => {
    it('登录端点应允许无Token访问', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@test.com',
          password: 'Test123!',
        });

      // 不应返回401
      expect(response.status).not.toBe(401);
    });

    it('注册端点应允许无Token访问', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `test-${Date.now()}@test.com`,
          password: 'Test123!',
          name: 'Test User',
        });

      // 不应返回401
      expect(response.status).not.toBe(401);
    });

    it('Swagger文档端点应可访问', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs');

      expect(response.status).not.toBe(401);
    });
  });
});
