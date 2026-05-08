import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * SQL注入防护测试
 * 
 * 验证所有用户输入点都能正确防御SQL注入攻击
 * 使用Prisma ORM进行参数化查询，但仍需验证输入验证层
 */
describe('SQL注入防护测试 (Security)', () => {
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

  // ==================== 经典SQL注入载荷 ====================
  const SQL_INJECTION_PAYLOADS = [
    // 基础注入
    "' OR '1'='1",
    "' OR '1'='1' --",
    "' OR '1'='1' /*",
    "admin'--",
    "admin'/*",
    
    // UNION注入
    "' UNION SELECT * FROM users --",
    "' UNION ALL SELECT NULL,NULL,NULL --",
    "1 UNION SELECT username, password FROM users --",
    
    // 堆叠查询
    "'; DROP TABLE users; --",
    "'; INSERT INTO users VALUES('hacker','hacked'); --",
    "'; UPDATE users SET role='OWNER' WHERE email='hacker@test.com'; --",
    
    // 盲注
    "' AND 1=1 --",
    "' AND 1=2 --",
    "' AND (SELECT COUNT(*) FROM users) > 0 --",
    "' AND SUBSTRING(password,1,1)='a' --",
    
    // 时间盲注
    "'; WAITFOR DELAY '0:0:5' --",
    "' AND SLEEP(5) --",
    "' AND pg_sleep(5) --",
    
    // 报错注入
    "' AND EXTRACTVALUE(1,CONCAT(0x7e,(SELECT version()))) --",
    "' AND (SELECT 1 FROM(SELECT COUNT(*),CONCAT(version(),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a) --",
    
    // 二阶注入
    "test'||(SELECT password FROM users LIMIT 1)||'",
    
    // 编码绕过
    "%27%20OR%20%271%27%3D%271",
    "0x27204f52202731273d2731",
    
    // NoSQL注入（MongoDB风格，虽用PostgreSQL但需验证）
    '{"$gt": ""}',
    '{"$ne": null}',
  ];

  describe('登录接口 SQL注入防护', () => {
    SQL_INJECTION_PAYLOADS.forEach((payload) => {
      it(`应拒绝SQL注入载荷: ${payload.substring(0, 50)}...`, async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({
            email: payload,
            password: payload,
          });

        // 不应返回200成功登录
        expect(response.status).not.toBe(200);
        // 不应泄露数据库错误信息
        expect(response.body.message).not.toMatch(/sql|syntax|query|postgresql|prisma/i);
      });
    });

    it('应拒绝包含SQL关键字的邮箱', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: "SELECT * FROM users WHERE 1=1--@test.com",
          password: 'Test123!',
        });

      expect(response.status).toBe(400);
    });

    it('应拒绝包含分号的密码', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@test.com',
          password: "'; DROP TABLE users; --",
        });

      // 应返回400或401，不应返回500
      expect([400, 401]).toContain(response.status);
    });
  });

  describe('注册接口 SQL注入防护', () => {
    SQL_INJECTION_PAYLOADS.slice(0, 10).forEach((payload) => {
      it(`应拒绝注册中的SQL注入: ${payload.substring(0, 50)}...`, async () => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email: payload.includes('@') ? payload : `${payload}@test.com`,
            password: 'Test123!',
            name: payload,
          });

        expect(response.status).not.toBe(201);
        expect(response.body.message).not.toMatch(/sql|syntax|query|postgresql|prisma/i);
      });
    });
  });

  describe('查询参数 SQL注入防护', () => {
    let authToken: string;

    beforeAll(async () => {
      // 获取认证token
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: 'test@matrixflow.com', password: 'Test123!' });
        authToken = res.body?.data?.accessToken;
      } catch {
        authToken = 'test-token';
      }
    });

    it('应拒绝搜索参数中的SQL注入', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/users')
        .query({ search: "' OR '1'='1' --" })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).not.toBe(500);
      if (response.body?.data) {
        // 不应返回所有用户
        expect(JSON.stringify(response.body)).not.toMatch(/password/i);
      }
    });

    it('应拒绝ID参数中的SQL注入', async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/accounts/'; DROP TABLE accounts; --")
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).not.toBe(500);
    });

    it('应拒绝分页参数中的SQL注入', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts')
        .query({ skip: "0; DROP TABLE users; --", take: 10 })
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).not.toBe(500);
    });
  });

  describe('请求体 SQL注入防护', () => {
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

    it('应拒绝创建账号中的SQL注入', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: "DOUYIN'; DROP TABLE accounts; --",
          platformUserId: "' OR '1'='1",
          nickname: "test'||(SELECT password FROM users LIMIT 1)||'",
        });

      expect(response.status).not.toBe(500);
    });

    it('应拒绝创建内容中的SQL注入', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: "'; UPDATE users SET role='OWNER'; --",
          content: '<script>alert("xss")</script>',
          accountId: "'; DROP TABLE posts; --",
        });

      expect(response.status).not.toBe(500);
    });
  });

  describe('错误信息泄露检查', () => {
    it('错误响应不应包含数据库结构信息', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'wrongpassword',
        });

      const bodyStr = JSON.stringify(response.body);
      expect(bodyStr).not.toMatch(/prisma|postgresql|pg_|information_schema|table|column|constraint/i);
    });

    it('错误响应不应包含堆栈信息', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/accounts/invalid-id-format-!@#$%')
        .set('Authorization', 'Bearer invalid-token');

      const bodyStr = JSON.stringify(response.body);
      expect(bodyStr).not.toMatch(/at\s+\w+\.\w+\s*\(|node_modules|\.ts:\d+:\d+/i);
    });
  });
});
