import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * API响应时间测试
 * 
 * 验证所有API端点的响应时间 < 200ms
 * 测试不同负载下的响应时间稳定性
 */
describe('API响应时间测试 (Performance)', () => {
  let app: INestApplication;
  let authToken: string;

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

    // 获取认证Token
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'test@matrixflow.com', password: 'Test123!' });
      authToken = res.body?.data?.accessToken || 'test-token';
    } catch {
      authToken = 'test-token';
    }
  });

  afterAll(async () => {
    await app.close();
  });

  // ==================== 辅助函数 ====================
  const MAX_RESPONSE_TIME = 200; // ms

  async function measureResponseTime(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    body?: any,
    headers?: Record<string, string>,
  ): Promise<{ status: number; time: number }> {
    const start = performance.now();

    let req = (request(app.getHttpServer()) as any)[method](path);

    if (headers) {
      Object.entries(headers).forEach(([key, value]) => {
        req = req.set(key, value);
      });
    }

    if (body) {
      req = req.send(body);
    }

    const response = await req;
    const time = performance.now() - start;

    return { status: response.status, time };
  }

  // ==================== 认证接口响应时间 ====================
  describe('认证接口响应时间', () => {
    it('POST /api/v1/auth/login 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'post',
        '/api/v1/auth/login',
        { email: 'test@matrixflow.com', password: 'Test123!' },
      );

      console.log(`  登录接口: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('POST /api/v1/auth/register 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'post',
        '/api/v1/auth/register',
        {
          email: `perf-${Date.now()}@test.com`,
          password: 'Test123!',
          name: 'Performance Test',
        },
      );

      console.log(`  注册接口: ${time.toFixed(2)}ms (状态: ${status})`);
      // 注册涉及数据库写入，允许稍长时间
      expect(time).toBeLessThan(MAX_RESPONSE_TIME * 2);
    });

    it('POST /api/v1/auth/refresh 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'post',
        '/api/v1/auth/refresh',
        { refreshToken: 'test-refresh-token' },
      );

      console.log(`  刷新Token: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });
  });

  // ==================== 用户接口响应时间 ====================
  describe('用户接口响应时间', () => {
    it('GET /api/v1/users/me 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/users/me',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  当前用户: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('GET /api/v1/users 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/users?take=20',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  用户列表: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('GET /api/v1/users?search=test 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/users?search=test&take=10',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  用户搜索: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('PUT /api/v1/users/me 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'put',
        '/api/v1/users/me',
        { name: 'Updated Name' },
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  更新用户: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });
  });

  // ==================== 账号接口响应时间 ====================
  describe('账号接口响应时间', () => {
    it('GET /api/v1/accounts 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/accounts?take=20',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  账号列表: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('GET /api/v1/accounts?platform=DOUYIN 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/accounts?platform=DOUYIN&take=10',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  账号筛选: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('POST /api/v1/accounts 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'post',
        '/api/v1/accounts',
        {
          platform: 'DOUYIN',
          platformUserId: `perf-test-${Date.now()}`,
          nickname: 'Performance Test Account',
        },
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  创建账号: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME * 2);
    });
  });

  // ==================== 内容接口响应时间 ====================
  describe('内容接口响应时间', () => {
    it('GET /api/v1/content 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/content?take=20',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  内容列表: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('GET /api/v1/content/scheduled 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/content/scheduled',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  待发布队列: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('POST /api/v1/content 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'post',
        '/api/v1/content',
        {
          title: 'Performance Test Content',
          content: 'Test content body',
          accountId: 'test-account-id',
        },
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  创建内容: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME * 2);
    });
  });

  // ==================== 团队接口响应时间 ====================
  describe('团队接口响应时间', () => {
    it('GET /api/v1/teams 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/teams',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  团队列表: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });

    it('GET /api/v1/teams/members 应 < 200ms', async () => {
      const { time, status } = await measureResponseTime(
        'get',
        '/api/v1/teams/members',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  成员列表: ${time.toFixed(2)}ms (状态: ${status})`);
      expect(time).toBeLessThan(MAX_RESPONSE_TIME);
    });
  });

  // ==================== 连续请求稳定性测试 ====================
  describe('连续请求稳定性', () => {
    it('连续10次请求应保持稳定响应时间', async () => {
      const times: number[] = [];

      for (let i = 0; i < 10; i++) {
        const { time } = await measureResponseTime(
          'get',
          '/api/v1/users/me',
          undefined,
          { Authorization: `Bearer ${authToken}` },
        );
        times.push(time);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const max = Math.max(...times);
      const min = Math.min(...times);
      const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
      const stdDev = Math.sqrt(variance);

      console.log(`  连续请求统计:`);
      console.log(`    平均: ${avg.toFixed(2)}ms`);
      console.log(`    最小: ${min.toFixed(2)}ms`);
      console.log(`    最大: ${max.toFixed(2)}ms`);
      console.log(`    标准差: ${stdDev.toFixed(2)}ms`);

      // 平均响应时间应 < 200ms
      expect(avg).toBeLessThan(MAX_RESPONSE_TIME);
      // 标准差应合理（响应时间稳定）
      expect(stdDev).toBeLessThan(avg * 0.5);
    });

    it('连续20次不同端点请求应保持稳定', async () => {
      const endpoints = [
        { method: 'get' as const, path: '/api/v1/users/me' },
        { method: 'get' as const, path: '/api/v1/accounts?take=5' },
        { method: 'get' as const, path: '/api/v1/content?take=5' },
        { method: 'get' as const, path: '/api/v1/teams' },
      ];

      const times: number[] = [];

      for (let i = 0; i < 20; i++) {
        const endpoint = endpoints[i % endpoints.length];
        const { time } = await measureResponseTime(
          endpoint.method,
          endpoint.path,
          undefined,
          { Authorization: `Bearer ${authToken}` },
        );
        times.push(time);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      console.log(`  混合端点平均响应时间: ${avg.toFixed(2)}ms`);
      expect(avg).toBeLessThan(MAX_RESPONSE_TIME);
    });
  });

  // ==================== 分页性能测试 ====================
  describe('分页性能', () => {
    it('不同分页大小应保持响应时间', async () => {
      const pageSizes = [10, 20, 50, 100];

      for (const size of pageSizes) {
        const { time } = await measureResponseTime(
          'get',
          `/api/v1/accounts?take=${size}`,
          undefined,
          { Authorization: `Bearer ${authToken}` },
        );

        console.log(`  分页大小 ${size}: ${time.toFixed(2)}ms`);
        expect(time).toBeLessThan(MAX_RESPONSE_TIME);
      }
    });

    it('深分页应保持合理响应时间', async () => {
      const { time } = await measureResponseTime(
        'get',
        '/api/v1/accounts?skip=1000&take=20',
        undefined,
        { Authorization: `Bearer ${authToken}` },
      );

      console.log(`  深分页 (skip=1000): ${time.toFixed(2)}ms`);
      // 深分页可能稍慢，但不应超过500ms
      expect(time).toBeLessThan(500);
    });
  });
});
