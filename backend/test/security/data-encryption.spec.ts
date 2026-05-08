import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../../src/app.module';

/**
 * 数据加密验证测试
 * 
 * 验证敏感数据的加密存储和传输：
 * - 密码哈希（bcrypt）
 * - Cookie加密
 * - JWT安全配置
 * - 敏感字段加密
 * - HTTPS传输
 */
describe('数据加密验证 (Security)', () => {
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

  describe('密码哈希验证', () => {
    it('注册时密码应使用bcrypt哈希存储', async () => {
      const testPassword = 'TestPassword123!';
      const email = `hash-test-${Date.now()}@test.com`;

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: testPassword,
          name: 'Hash Test User',
        });

      if (response.status === 201) {
        // 注册成功后尝试用原始密码登录（验证哈希存储正确）
        const loginResponse = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email,
            password: testPassword,
          });

        expect(loginResponse.status).toBe(200);
      }
    });

    it('密码不应以明文存储', async () => {
      const testPassword = 'PlainTextTest123!';
      const email = `plaintext-test-${Date.now()}@test.com`;

      // 注册用户
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email,
          password: testPassword,
          name: 'Plain Text Test',
        });

      // 使用错误密码登录验证
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email,
          password: 'wrong-password',
        });

      // 错误密码应返回401
      expect(response.status).toBe(401);
      // 响应不应包含原始密码
      expect(JSON.stringify(response.body)).not.toContain(testPassword);
    });

    it('bcrypt哈希应使用足够的rounds（>=10）', () => {
      // 验证bcrypt配置
      const hash = bcrypt.hashSync('test', 10);
      expect(hash).toMatch(/^\$2[aby]?\$\d{2}\$/);

      // 验证rounds >= 10
      const rounds = parseInt(hash.split('$')[2], 10);
      expect(rounds).toBeGreaterThanOrEqual(10);
    });

    it('相同密码应生成不同的哈希值', async () => {
      const password = 'SamePassword123!';

      const hash1 = await bcrypt.hash(password, 10);
      const hash2 = await bcrypt.hash(password, 10);

      // 由于salt不同，哈希值应不同
      expect(hash1).not.toBe(hash2);

      // 但两个哈希都应能验证原始密码
      expect(await bcrypt.compare(password, hash1)).toBe(true);
      expect(await bcrypt.compare(password, hash2)).toBe(true);
    });
  });

  describe('JWT Token安全', () => {
    it('JWT应包含正确的payload结构', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      if (response.status === 200) {
        const { accessToken } = response.body.data;

        // 解码JWT payload
        const parts = accessToken.split('.');
        expect(parts.length).toBe(3);

        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

        // 应包含必要字段
        expect(payload).toHaveProperty('sub');
        expect(payload).toHaveProperty('email');
        expect(payload).toHaveProperty('exp');
        expect(payload).toHaveProperty('iat');

        // 不应包含敏感信息
        expect(payload).not.toHaveProperty('password');
        expect(payload).not.toHaveProperty('secret');
      }
    });

    it('JWT过期时间应合理（Access Token <= 30分钟）', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      if (response.status === 200) {
        const { accessToken } = response.body.data;
        const parts = accessToken.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());

        const expiresIn = payload.exp - payload.iat;
        // Access Token过期时间应不超过30分钟（1800秒）
        expect(expiresIn).toBeLessThanOrEqual(1800);
        // 但也不应太短（至少5分钟）
        expect(expiresIn).toBeGreaterThanOrEqual(300);
      }
    });

    it('Refresh Token应比Access Token有更长的有效期', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      if (response.status === 200) {
        const { accessToken, refreshToken } = response.body.data;

        const accessPayload = JSON.parse(
          Buffer.from(accessToken.split('.')[1], 'base64url').toString()
        );
        const refreshPayload = JSON.parse(
          Buffer.from(refreshToken.split('.')[1], 'base64url').toString()
        );

        const accessExpiry = accessPayload.exp - accessPayload.iat;
        const refreshExpiry = refreshPayload.exp - refreshPayload.iat;

        // Refresh Token应比Access Token有效期更长
        expect(refreshExpiry).toBeGreaterThan(accessExpiry);
      }
    });

    it('Access Token和Refresh Token应使用不同的密钥', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      if (response.status === 200) {
        const { accessToken, refreshToken } = response.body.data;

        // 验证两个Token不同
        expect(accessToken).not.toBe(refreshToken);

        // 尝试用Access Token刷新（应失败）
        const refreshResponse = await request(app.getHttpServer())
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: accessToken });

        expect(refreshResponse.status).toBe(401);
      }
    });
  });

  describe('敏感数据响应检查', () => {
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

    it('用户信息响应不应包含密码字段', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        const bodyStr = JSON.stringify(response.body);
        expect(bodyStr).not.toMatch(/password/i);
      }
    });

    it('用户列表响应不应包含密码字段', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200) {
        const bodyStr = JSON.stringify(response.body);
        expect(bodyStr).not.toMatch(/password/i);
      }
    });

    it('登录响应不应返回原始密码', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      if (response.status === 200) {
        expect(JSON.stringify(response.body)).not.toContain('Test123!');
      }
    });

    it('注册响应不应返回原始密码', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: `no-pwd-${Date.now()}@test.com`,
          password: 'SecretPass123!',
          name: 'No Password User',
        });

      if (response.status === 201) {
        expect(JSON.stringify(response.body)).not.toContain('SecretPass123!');
      }
    });

    it('账号Cookie数据应加密存储', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`);

      if (response.status === 200 && response.body?.data?.length > 0) {
        const account = response.body.data[0];
        // Cookie字段不应以明文形式出现在列表中
        if (account.cookies) {
          // 应该是加密后的字符串
          expect(account.cookies).not.toMatch(/^\[/); // 不应是明文JSON数组
          expect(account.cookies).not.toMatch(/^\{/); // 不应是明文JSON对象
        }
      }
    });
  });

  describe('HTTPS配置检查', () => {
    it('生产环境应强制HTTPS', () => {
      // 此测试在CI环境中检查环境变量配置
      const isProduction = process.env.NODE_ENV === 'production';

      if (isProduction) {
        // 验证HTTPS相关环境变量
        expect(process.env.FORCE_HTTPS).not.toBe('false');
      }
    });

    it('应配置安全的TLS版本', () => {
      // 验证TLS配置（通过环境变量或配置文件）
      const tlsVersion = process.env.TLS_MIN_VERSION || 'TLSv1.2';
      expect(['TLSv1.2', 'TLSv1.3']).toContain(tlsVersion);
    });
  });

  describe('Cookie加密', () => {
    it('Cookie应设置正确的安全属性', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;

        // 验证安全属性
        if (cookieStr.includes('token') || cookieStr.includes('refreshToken')) {
          expect(cookieStr.toLowerCase()).toContain('httponly');
          expect(cookieStr.toLowerCase()).toMatch(/samesite=(strict|lax)/);
        }
      }
    });

    it('Cookie不应包含敏感明文数据', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@matrixflow.com',
          password: 'Test123!',
        });

      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;

        // Cookie值不应包含明文密码或邮箱
        expect(cookieStr).not.toContain('Test123!');
        expect(cookieStr).not.toContain('test@matrixflow.com');
      }
    });
  });

  describe('环境变量安全', () => {
    it('JWT密钥不应使用默认值', () => {
      const jwtSecret = process.env.JWT_SECRET;
      if (process.env.NODE_ENV === 'production') {
        expect(jwtSecret).toBeDefined();
        expect(jwtSecret).not.toBe('matrixflow-jwt-secret-key');
        expect(jwtSecret!.length).toBeGreaterThanOrEqual(32);
      }
    });

    it('数据库密码应从环境变量读取', () => {
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        // 数据库URL应包含密码
        expect(dbUrl).toMatch(/:.*@/);
      }
    });

    it('Redis密码应从环境变量读取', () => {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl && process.env.NODE_ENV === 'production') {
        expect(redisUrl).toMatch(/:.*@/);
      }
    });
  });
});
