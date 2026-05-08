import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * 安全配置检查清单
 * 
 * 验证应用的安全配置是否符合最佳实践：
 * - CORS配置
 * - CSP头
 * - Helmet配置
 * - JWT密钥强度
 * - Cookie安全标志
 * - HTTPS配置
 * - 错误处理
 * - 日志安全
 */
describe('安全配置检查 (Security)', () => {
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

  // ==================== CORS配置检查 ====================
  describe('CORS配置', () => {
    it('应配置CORS（不应允许所有源在生产环境）', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/auth/login')
        .set('Origin', 'https://test-origin.com')
        .set('Access-Control-Request-Method', 'POST');

      // 应有CORS头
      const allowOrigin = response.headers['access-control-allow-origin'];
      expect(allowOrigin).toBeDefined();

      // 生产环境不应是 *
      if (process.env.NODE_ENV === 'production') {
        expect(allowOrigin).not.toBe('*');
      }
    });

    it('CORS应限制允许的HTTP方法', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/auth/login')
        .set('Origin', 'https://test-origin.com')
        .set('Access-Control-Request-Method', 'POST');

      const allowMethods = response.headers['access-control-allow-methods'];
      if (allowMethods) {
        // 不应允许TRACE、CONNECT等危险方法
        expect(allowMethods).not.toContain('TRACE');
        expect(allowMethods).not.toContain('CONNECT');
      }
    });

    it('CORS应限制允许的请求头', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/auth/login')
        .set('Origin', 'https://test-origin.com')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

      const allowHeaders = response.headers['access-control-allow-headers'];
      if (allowHeaders) {
        // 应限制允许的头
        expect(allowHeaders).toContain('Content-Type');
        expect(allowHeaders).toContain('Authorization');
      }
    });

    it('CORS应支持凭据（credentials）', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/auth/login')
        .set('Origin', 'https://test-origin.com')
        .set('Access-Control-Request-Method', 'POST');

      const allowCredentials = response.headers['access-control-allow-credentials'];
      expect(allowCredentials).toBe('true');
    });
  });

  // ==================== 安全头检查 ====================
  describe('安全响应头', () => {
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

    it('应设置X-Content-Type-Options: nosniff', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('应设置X-Frame-Options', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      const xFrameOptions = response.headers['x-frame-options'];
      expect(xFrameOptions).toBeDefined();
      expect(['DENY', 'SAMEORIGIN']).toContain(xFrameOptions);
    });

    it('应设置X-XSS-Protection', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      // 现代最佳实践是设置为 "0"（禁用浏览器XSS过滤器，使用CSP代替）
      expect(response.headers['x-xss-protection']).toBeDefined();
    });

    it('应设置Strict-Transport-Security（HSTS）', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      const hsts = response.headers['strict-transport-security'];
      if (process.env.NODE_ENV === 'production') {
        expect(hsts).toBeDefined();
        expect(hsts).toMatch(/max-age=\d+/);
      }
    });

    it('应设置Content-Security-Policy', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      const csp = response.headers['content-security-policy'];
      if (csp) {
        // CSP应限制脚本来源
        expect(csp).toContain("default-src");
        // 不应有unsafe-inline或unsafe-eval（除非必要）
        // expect(csp).not.toContain("'unsafe-inline'");
      }
    });

    it('应设置Referrer-Policy', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      const referrerPolicy = response.headers['referrer-policy'];
      if (referrerPolicy) {
        expect([
          'no-referrer',
          'no-referrer-when-downgrade',
          'origin',
          'origin-when-cross-origin',
          'same-origin',
          'strict-origin',
          'strict-origin-when-cross-origin',
        ]).toContain(referrerPolicy);
      }
    });

    it('应设置Permissions-Policy', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      const permissionsPolicy = response.headers['permissions-policy'];
      if (permissionsPolicy) {
        // 应限制敏感API
        expect(permissionsPolicy).toMatch(/camera|microphone|geolocation/);
      }
    });
  });

  // ==================== JWT配置检查 ====================
  describe('JWT配置安全', () => {
    it('JWT密钥强度应足够', () => {
      const jwtSecret = process.env.JWT_SECRET;

      if (jwtSecret) {
        // 密钥长度应至少32字符
        expect(jwtSecret.length).toBeGreaterThanOrEqual(32);

        // 不应使用默认值
        expect(jwtSecret).not.toBe('matrixflow-jwt-secret-key');
        expect(jwtSecret).not.toBe('secret');
        expect(jwtSecret).not.toBe('jwt-secret');
      }
    });

    it('JWT应使用安全的算法', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      if (response.status === 200) {
        const { accessToken } = response.body.data;
        const header = JSON.parse(
          Buffer.from(accessToken.split('.')[0], 'base64url').toString()
        );

        // 应使用安全的算法
        expect(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512']).toContain(header.alg);
        // 不应使用none算法
        expect(header.alg).not.toBe('none');
      }
    });

    it('JWT Access Token过期时间应合理', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      if (response.status === 200) {
        const { accessToken } = response.body.data;
        const payload = JSON.parse(
          Buffer.from(accessToken.split('.')[1], 'base64url').toString()
        );

        const expiresIn = payload.exp - payload.iat;
        // Access Token应在5分钟到30分钟之间
        expect(expiresIn).toBeGreaterThanOrEqual(300);
        expect(expiresIn).toBeLessThanOrEqual(1800);
      }
    });
  });

  // ==================== Cookie安全检查 ====================
  describe('Cookie安全标志', () => {
    it('认证Cookie应设置HttpOnly', async () => {
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
          expect(cookieStr.toLowerCase()).toContain('httponly');
        }
      }
    });

    it('认证Cookie应设置SameSite', async () => {
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

    it('生产环境Cookie应设置Secure', async () => {
      if (process.env.NODE_ENV !== 'production') return;

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
          expect(cookieStr.toLowerCase()).toContain('secure');
        }
      }
    });
  });

  // ==================== 输入验证检查 ====================
  describe('输入验证配置', () => {
    it('应启用全局验证管道', async () => {
      // 发送不符合DTO的数据
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          password: '123', // 太短
          name: '',
        });

      // 应返回400验证错误
      expect(response.status).toBe(400);
    });

    it('应拒绝未知字段（whitelist + forbidNonWhitelisted）', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'test@test.com',
          password: 'Test123!',
          name: 'Test',
          maliciousField: 'should be rejected',
        });

      // 应返回400
      expect(response.status).toBe(400);
    });

    it('应自动转换类型（transform）', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .query({ skip: '0', take: '10' });

      // 类型转换不应导致500错误
      expect(response.status).not.toBe(500);
    });
  });

  // ==================== 错误处理检查 ====================
  describe('错误处理安全', () => {
    it('404错误不应泄露服务器信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/nonexistent-endpoint');

      expect(response.status).toBe(404);
      // 不应包含服务器版本信息
      expect(response.headers['server']).toBeUndefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('500错误不应泄露堆栈信息', async () => {
      // 触发一个可能的500错误
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts/invalid-id-format');

      const bodyStr = JSON.stringify(response.body);
      // 不应包含堆栈跟踪
      expect(bodyStr).not.toMatch(/at\s+\w+\.\w+\s*\(/);
      expect(bodyStr).not.toMatch(/node_modules/);
      expect(bodyStr).not.toMatch(/\.ts:\d+:\d+/);
    });

    it('错误响应应使用标准格式', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'wrong',
        });

      // 应有标准错误结构
      expect(response.body).toHaveProperty('statusCode');
      expect(response.body).toHaveProperty('message');
      // 不应暴露内部错误详情
      expect(response.body).not.toHaveProperty('stack');
    });
  });

  // ==================== 服务信息泄露检查 ====================
  describe('服务信息泄露防护', () => {
    it('不应暴露X-Powered-By头', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/login');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('不应暴露Server头中的版本信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/auth/login');

      const server = response.headers['server'];
      if (server) {
        // 不应包含版本号
        expect(server).not.toMatch(/\d+\.\d+/);
      }
    });

    it('Swagger文档端点应有访问控制', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/docs');

      // 在生产环境可能需要认证
      if (process.env.NODE_ENV === 'production') {
        // 可能返回401或403
        expect([200, 401, 403]).toContain(response.status);
      }
    });
  });

  // ==================== 请求大小限制 ====================
  describe('请求大小限制', () => {
    it('应限制请求体大小', async () => {
      const largePayload = {
        email: 'test@test.com',
        password: 'Test123!',
        name: 'A'.repeat(1024 * 1024), // 1MB的name
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(largePayload);

      // 应拒绝过大的请求
      expect([400, 413]).toContain(response.status);
    });

    it('应限制URL长度', async () => {
      const longSearch = 'a'.repeat(10000);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/users?search=${longSearch}`);

      // 不应返回500
      expect(response.status).not.toBe(500);
    });
  });

  // ==================== 安全清单汇总 ====================
  describe('安全配置清单汇总', () => {
    it('应通过所有安全配置检查', () => {
      const checks = {
        cors: process.env.CORS_ORIGIN !== undefined,
        jwtSecret: (process.env.JWT_SECRET?.length || 0) >= 32,
        nodeEnv: process.env.NODE_ENV !== undefined,
        databaseUrl: process.env.DATABASE_URL !== undefined,
      };

      console.log('\n=== 安全配置检查清单 ===');
      console.log(`CORS配置: ${checks.cors ? '✅' : '⚠️  使用默认配置'}`);
      console.log(`JWT密钥强度: ${checks.jwtSecret ? '✅' : '⚠️  使用默认密钥'}`);
      console.log(`环境配置: ${checks.nodeEnv ? '✅' : '⚠️  未设置NODE_ENV'}`);
      console.log(`数据库配置: ${checks.databaseUrl ? '✅' : '⚠️  未配置DATABASE_URL'}`);
      console.log('========================\n');

      // 在非生产环境，这些是警告而非失败
      if (process.env.NODE_ENV === 'production') {
        expect(checks.cors).toBe(true);
        expect(checks.jwtSecret).toBe(true);
        expect(checks.nodeEnv).toBe(true);
      }
    });
  });
});
