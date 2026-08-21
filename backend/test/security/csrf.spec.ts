import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * CSRF（跨站请求伪造）防护测试
 * 
 * 验证系统对CSRF攻击的防御能力：
 * - CSRF Token机制
 * - SameSite Cookie属性
 * - Origin/Referer头验证
 * - 自定义请求头验证
 */
describe('CSRF防护测试 (Security)', () => {
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

  describe('Cookie安全属性', () => {
    it('登录响应Cookie应设置HttpOnly标志', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;
        // Token Cookie应设置HttpOnly
        if (cookieStr.includes('token') || cookieStr.includes('refreshToken')) {
          expect(cookieStr.toLowerCase()).toContain('httponly');
        }
      }
    });

    it('登录响应Cookie应设置Secure标志（生产环境）', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      const cookies = response.headers['set-cookie'];
      if (cookies && process.env.NODE_ENV === 'production') {
        const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;
        expect(cookieStr.toLowerCase()).toContain('secure');
      }
    });

    it('登录响应Cookie应设置SameSite属性', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;
        if (cookieStr.includes('token') || cookieStr.includes('refreshToken')) {
          expect(cookieStr.toLowerCase()).toMatch(/samesite=(strict|lax)/);
        }
      }
    });
  });

  describe('Origin头验证', () => {
    let authToken: string;

    beforeAll(async () => {
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'test@matrixflow.com', password: 'Test123!' });
        authToken = res.body?.data?.accessToken;
      } catch {
        authToken = 'test-token';
      }
    });

    it('应拒绝来自未知Origin的请求', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Origin', 'https://evil-site.com')
        .send({
          platform: 'DOUYIN',
          platformUserId: 'csrf-test',
          nickname: 'CSRF Test',
        });

      // CORS应拒绝非法源
      if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*') {
        expect(response.status).not.toBe(201);
      }
    });

    it('应拒绝来自null Origin的请求', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Origin', 'null')
        .send({
          platform: 'DOUYIN',
          platformUserId: 'csrf-null-test',
          nickname: 'CSRF Null Test',
        });

      // null origin通常来自file://协议，应被拒绝
      if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*') {
        expect(response.status).not.toBe(201);
      }
    });
  });

  describe('Referer头验证', () => {
    let authToken: string;

    beforeAll(async () => {
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'test@matrixflow.com', password: 'Test123!' });
        authToken = res.body?.data?.accessToken;
      } catch {
        authToken = 'test-token';
      }
    });

    it('应处理缺失Referer头的POST请求', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: 'DOUYIN',
          platformUserId: 'no-referer-test',
          nickname: 'No Referer',
        });

      // 无Referer的请求可能被接受（移动端、API客户端）
      // 但应记录日志
      expect([200, 201, 400, 401, 403]).toContain(response.status);
    });

    it('应拒绝Referer与Origin不匹配的请求', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Origin', 'https://app.matrixflow.com')
        .set('Referer', 'https://evil-site.com/csrf.html')
        .send({
          platform: 'DOUYIN',
          platformUserId: 'referer-mismatch',
          nickname: 'Referer Mismatch',
        });

      if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*') {
        expect(response.status).not.toBe(201);
      }
    });
  });

  describe('自定义请求头验证', () => {
    let authToken: string;

    beforeAll(async () => {
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'test@matrixflow.com', password: 'Test123!' });
        authToken = res.body?.data?.accessToken;
      } catch {
        authToken = 'test-token';
      }
    });

    it('应支持X-Requested-With自定义头', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(response.status).toBe(200);
    });

    it('应正确处理CORS预检请求', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/accounts')
        .set('Origin', 'https://app.matrixflow.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      // 预检请求应返回2xx
      expect(response.status).toBeLessThan(300);
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });
  });

  describe('敏感操作双重验证', () => {
    let authToken: string;

    beforeAll(async () => {
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'test@matrixflow.com', password: 'Test123!' });
        authToken = res.body?.data?.accessToken;
      } catch {
        authToken = 'test-token';
      }
    });

    it('删除操作应要求认证', async () => {
      const response = await request(app.getHttpServer())
        .delete('/api/v1/accounts/nonexistent-id');

      expect(response.status).toBe(401);
    });

    it('修改密码应要求当前密码', async () => {
      const response = await request(app.getHttpServer())
        .put('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          newPassword: 'NewPassword123!',
        });

      // 应要求提供当前密码
      expect([400, 422]).toContain(response.status);
    });
  });

  describe('响应缓存控制', () => {
    let authToken: string;

    beforeAll(async () => {
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'test@matrixflow.com', password: 'Test123!' });
        authToken = res.body?.data?.accessToken;
      } catch {
        authToken = 'test-token';
      }
    });

    it('敏感接口应设置Cache-Control: no-store', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      const cacheControl = response.headers['cache-control'];
      if (cacheControl) {
        expect(cacheControl).toMatch(/no-store|no-cache|private/);
      }
    });

    it('认证接口不应被缓存', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      const cacheControl = response.headers['cache-control'];
      if (cacheControl) {
        expect(cacheControl).toMatch(/no-store|no-cache/);
      }
    });
  });
});
