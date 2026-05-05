/**
 * 完整发布流程 E2E 测试
 * 测试从创建内容到发布成功的完整业务流程
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { ContentModule } from '../../src/modules/content/content.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockUsers, mockAccounts, mockPosts } from '../fixtures';
import { PostStatus, Platform } from '@prisma/client';

describe('Publish Flow E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let accessToken: string;

  beforeAll(async () => {
    resetPrismaMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, ContentModule],
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

    // 生成测试用的 Access Token
    accessToken = await jwtService.signAsync({
      sub: mockUsers.regular.id,
      email: mockUsers.regular.email,
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetPrismaMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 创建内容测试 ====================

  describe('POST /api/v1/content', () => {
    it('应成功创建草稿内容', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue({
        ...mockPosts.draft,
        id: 'post-e2e-001',
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId: 'acc-001',
          title: 'E2E 测试内容',
          content: '这是一篇 E2E 测试内容',
          tags: ['e2e', '测试'],
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.status).toBe(PostStatus.DRAFT);
    });

    it('应能创建定时发布内容', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue({
        ...mockPosts.scheduled,
        id: 'post-e2e-002',
        status: PostStatus.SCHEDULED,
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId: 'acc-001',
          title: '定时发布内容',
          publishAt: '2024-12-31T12:00:00Z',
        })
        .expect(201);

      expect(response.body.status).toBe(PostStatus.SCHEDULED);
    });

    it('无认证时应返回 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/content')
        .send({
          accountId: 'acc-001',
          title: '未认证请求',
        })
        .expect(401);
    });
  });

  // ==================== 查询内容测试 ====================

  describe('GET /api/v1/content', () => {
    it('应返回内容列表', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        mockPosts.draft,
        mockPosts.scheduled,
      ]);
      mockPrismaService.post.count.mockResolvedValue(2);

      const response = await request(app.getHttpServer())
        .get('/api/v1/content')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.posts).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    it('应支持按状态筛选', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([mockPosts.draft]);
      mockPrismaService.post.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer())
        .get('/api/v1/content?status=DRAFT')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.posts).toHaveLength(1);
    });
  });

  // ==================== 查询单个内容测试 ====================

  describe('GET /api/v1/content/:id', () => {
    it('应返回内容详情', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.published);

      const response = await request(app.getHttpServer())
        .get('/api/v1/content/post-003')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', 'post-003');
      expect(response.body).toHaveProperty('stats');
    });

    it('不存在的内容应返回 404', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get('/api/v1/content/nonexistent')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ==================== 发布内容测试 ====================

  describe('POST /api/v1/content/:id/publish', () => {
    it('应能发布草稿内容', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.draft,
        status: PostStatus.PUBLISHING,
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/content/post-001/publish')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.status).toBe(PostStatus.PUBLISHING);
    });

    it('已发布内容不能重复发布', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.published);

      await request(app.getHttpServer())
        .post('/api/v1/content/post-003/publish')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  // ==================== 更新内容测试 ====================

  describe('PUT /api/v1/content/:id', () => {
    it('应能更新草稿内容', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.draft,
        title: '更新后的标题',
      });

      const response = await request(app.getHttpServer())
        .put('/api/v1/content/post-001')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: '更新后的标题' })
        .expect(200);

      expect(response.body.title).toBe('更新后的标题');
    });

    it('已发布内容不能修改', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.published);

      await request(app.getHttpServer())
        .put('/api/v1/content/post-003')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: '尝试修改' })
        .expect(400);
    });
  });

  // ==================== 删除内容测试 ====================

  describe('DELETE /api/v1/content/:id', () => {
    it('应能删除草稿内容', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.delete.mockResolvedValue(mockPosts.draft);

      await request(app.getHttpServer())
        .delete('/api/v1/content/post-001')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('发布中的内容不能删除', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.publishing);

      await request(app.getHttpServer())
        .delete('/api/v1/content/post-005')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  // ==================== 完整发布流程测试 ====================

  describe('完整发布流程', () => {
    it('应支持 创建草稿 -> 编辑 -> 发布 -> 回调成功 的完整流程', async () => {
      // 1. 创建草稿
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue({
        ...mockPosts.draft,
        id: 'post-flow-001',
      });

      const createResponse = await request(app.getHttpServer())
        .post('/api/v1/content')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          accountId: 'acc-001',
          title: '完整流程测试',
          content: '测试内容',
          tags: ['e2e'],
        })
        .expect(201);

      const postId = createResponse.body.id;

      // 2. 编辑内容
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPosts.draft,
        id: postId,
      });
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.draft,
        id: postId,
        title: '编辑后的标题',
      });

      await request(app.getHttpServer())
        .put(`/api/v1/content/${postId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ title: '编辑后的标题' })
        .expect(200);

      // 3. 发布
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPosts.draft,
        id: postId,
      });
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.draft,
        id: postId,
        status: PostStatus.PUBLISHING,
      });

      const publishResponse = await request(app.getHttpServer())
        .post(`/api/v1/content/${postId}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(publishResponse.body.status).toBe(PostStatus.PUBLISHING);

      // 4. 模拟发布成功回调（通过 Service 层）
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.published,
        id: postId,
        status: PostStatus.PUBLISHED,
        platformUrl: 'https://douyin.com/video/flow-001',
      });

      // 注意：回调通常由内部服务调用，这里通过 Service 直接测试
      const contentService = app.get('ContentService');
      const callbackResult = await contentService.updatePublishStatus(
        postId,
        PostStatus.PUBLISHED,
        'https://douyin.com/video/flow-001',
      );

      expect(callbackResult.status).toBe(PostStatus.PUBLISHED);
      expect(callbackResult.platformUrl).toContain('flow-001');
    });

    it('应支持 发布失败 -> 重试成功 的流程', async () => {
      // 1. 发布失败
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.failed);

      // 2. 重试发布
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.failed);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.failed,
        status: PostStatus.PUBLISHING,
      });

      const retryResponse = await request(app.getHttpServer())
        .post('/api/v1/content/post-004/publish')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(retryResponse.body.status).toBe(PostStatus.PUBLISHING);

      // 3. 重试成功
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.published,
        status: PostStatus.PUBLISHED,
        platformUrl: 'https://douyin.com/video/retry-001',
      });

      const contentService = app.get('ContentService');
      const result = await contentService.updatePublishStatus(
        'post-004',
        PostStatus.PUBLISHED,
        'https://douyin.com/video/retry-001',
      );

      expect(result.status).toBe(PostStatus.PUBLISHED);
    });
  });
});
