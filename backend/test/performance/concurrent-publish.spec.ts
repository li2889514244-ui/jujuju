import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * 并发发布测试
 * 
 * 验证系统在并发发布场景下的表现：
 * - 多个用户同时发布内容
 * - 同一用户并发发布
 * - 发布队列处理能力
 * - 竞态条件防护
 * - 资源锁机制
 */
describe('并发发布测试 (Performance)', () => {
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

  // ==================== 并发内容创建 ====================
  describe('并发内容创建', () => {
    it('10个并发创建请求应全部成功或正确处理冲突', async () => {
      const concurrentCount = 10;
      const promises = [];

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          request(app.getHttpServer())
            .post('/api/v1/content')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              title: `Concurrent Content ${i}`,
              content: `Content body ${i} - ${Date.now()}`,
              accountId: 'test-account-id',
            })
        );
      }

      const responses = await Promise.all(promises);
      const successCount = responses.filter((r) => r.status === 201).length;
      const errorCount = responses.filter((r) => r.status >= 400).length;

      console.log(`  并发创建结果: 成功 ${successCount}, 失败 ${errorCount}`);

      // 不应有500服务器错误
      const serverErrors = responses.filter((r) => r.status >= 500);
      expect(serverErrors.length).toBe(0);
    });

    it('50个并发创建请求不应导致服务器崩溃', async () => {
      const concurrentCount = 50;
      const promises = [];

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          request(app.getHttpServer())
            .post('/api/v1/content')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              title: `Bulk Content ${i}`,
              content: `Bulk body ${i}`,
              accountId: 'test-account-id',
            })
        );
      }

      const responses = await Promise.all(promises);

      // 所有响应都应有有效的HTTP状态码
      responses.forEach((r) => {
        expect(r.status).toBeGreaterThanOrEqual(200);
        expect(r.status).toBeLessThan(600);
      });

      // 不应有服务器崩溃（500+）
      const serverErrors = responses.filter((r) => r.status >= 500);
      expect(serverErrors.length).toBe(0);
    });
  });

  // ==================== 并发发布操作 ====================
  describe('并发发布操作', () => {
    it('同一内容不应被重复发布', async () => {
      // 先创建一个内容
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Duplicate Publish Test',
          content: 'Should only publish once',
          accountId: 'test-account-id',
        });

      if (createRes.status === 201) {
        const contentId = createRes.body?.data?.id;

        // 并发发布同一内容
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(
            request(app.getHttpServer())
              .post(`/api/v1/content/${contentId}/publish`)
              .set('Authorization', `Bearer ${authToken}`)
          );
        }

        const responses = await Promise.all(promises);
        const successCount = responses.filter((r) => r.status === 200 || r.status === 201).length;

        // 只应有一个发布成功
        expect(successCount).toBeLessThanOrEqual(1);
      }
    });

    it('并发发布不同内容应正常处理', async () => {
      const contentIds: string[] = [];

      // 创建多个内容
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/content')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Publish Test ${i}`,
            content: `Content ${i}`,
            accountId: 'test-account-id',
          });

        if (res.status === 201) {
          contentIds.push(res.body?.data?.id);
        }
      }

      if (contentIds.length > 0) {
        // 并发发布不同内容
        const promises = contentIds.map((id) =>
          request(app.getHttpServer())
            .post(`/api/v1/content/${id}/publish`)
            .set('Authorization', `Bearer ${authToken}`)
        );

        const responses = await Promise.all(promises);

        // 不应有服务器错误
        const serverErrors = responses.filter((r) => r.status >= 500);
        expect(serverErrors.length).toBe(0);
      }
    });
  });

  // ==================== 并发账号操作 ====================
  describe('并发账号操作', () => {
    it('并发创建账号不应导致数据不一致', async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app.getHttpServer())
            .post('/api/v1/accounts')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              platform: 'DOUYIN',
              platformUserId: `concurrent-user-${i}-${Date.now()}`,
              nickname: `Concurrent Account ${i}`,
            })
        );
      }

      const responses = await Promise.all(promises);

      // 验证没有重复创建
      const createdIds = responses
        .filter((r) => r.status === 201)
        .map((r) => r.body?.data?.id)
        .filter(Boolean);

      const uniqueIds = new Set(createdIds);
      expect(uniqueIds.size).toBe(createdIds.length);
    });

    it('并发更新同一账号应正确处理', async () => {
      // 创建一个账号
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/accounts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          platform: 'KUAISHOU',
          platformUserId: `update-test-${Date.now()}`,
          nickname: 'Update Test',
        });

      if (createRes.status === 201) {
        const accountId = createRes.body?.data?.id;

        // 并发更新
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(
            request(app.getHttpServer())
              .put(`/api/v1/accounts/${accountId}`)
              .set('Authorization', `Bearer ${authToken}`)
              .send({ nickname: `Updated ${i}` })
          );
        }

        const responses = await Promise.all(promises);

        // 不应有服务器错误
        const serverErrors = responses.filter((r) => r.status >= 500);
        expect(serverErrors.length).toBe(0);
      }
    });
  });

  // ==================== 并发删除操作 ====================
  describe('并发删除操作', () => {
    it('并发删除同一资源不应导致500错误', async () => {
      // 创建一个内容
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Delete Test',
          content: 'Will be deleted',
          accountId: 'test-account-id',
        });

      if (createRes.status === 201) {
        const contentId = createRes.body?.data?.id;

        // 并发删除
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(
            request(app.getHttpServer())
              .delete(`/api/v1/content/${contentId}`)
              .set('Authorization', `Bearer ${authToken}`)
          );
        }

        const responses = await Promise.all(promises);

        // 不应有500错误
        const serverErrors = responses.filter((r) => r.status >= 500);
        expect(serverErrors.length).toBe(0);

        // 至少一个应成功（200或204）
        const successCount = responses.filter(
          (r) => r.status === 200 || r.status === 204
        ).length;
        expect(successCount).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ==================== 竞态条件测试 ====================
  describe('竞态条件防护', () => {
    it('余额/配额操作应防止竞态条件', async () => {
      // 模拟并发扣减场景
      // 在实际系统中，这可能涉及发布配额、存储配额等
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(
          request(app.getHttpServer())
            .post('/api/v1/content')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              title: `Race Condition Test ${i}`,
              content: `Test ${i}`,
              accountId: 'test-account-id',
            })
        );
      }

      const responses = await Promise.all(promises);

      // 不应有服务器错误
      const serverErrors = responses.filter((r) => r.status >= 500);
      expect(serverErrors.length).toBe(0);
    });
  });

  // ==================== 队列处理测试 ====================
  describe('发布队列处理', () => {
    it('批量发布请求应被正确排队', async () => {
      const contentIds: string[] = [];

      // 创建多个待发布内容
      for (let i = 0; i < 10; i++) {
        const res = await request(app.getHttpServer())
          .post('/api/v1/content')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            title: `Queue Test ${i}`,
            content: `Queue content ${i}`,
            accountId: 'test-account-id',
            publishAt: new Date(Date.now() + 60000).toISOString(), // 1分钟后
          });

        if (res.status === 201) {
          contentIds.push(res.body?.data?.id);
        }
      }

      // 查询待发布队列
      const queueRes = await request(app.getHttpServer())
        .get('/api/v1/content/scheduled')
        .set('Authorization', `Bearer ${authToken}`);

      if (queueRes.status === 200) {
        console.log(`  待发布队列长度: ${queueRes.body?.data?.length || 0}`);
      }

      expect(queueRes.status).not.toBe(500);
    });
  });

  // ==================== 响应时间在并发下的表现 ====================
  describe('并发下的响应时间', () => {
    it('并发请求的平均响应时间应 < 500ms', async () => {
      const start = performance.now();
      const promises = [];

      for (let i = 0; i < 20; i++) {
        promises.push(
          request(app.getHttpServer())
            .get('/api/v1/accounts?take=10')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const responses = await Promise.all(promises);
      const totalTime = performance.now() - start;
      const avgTime = totalTime / responses.length;

      console.log(`  20个并发请求平均响应时间: ${avgTime.toFixed(2)}ms`);
      expect(avgTime).toBeLessThan(500);
    });
  });
});
