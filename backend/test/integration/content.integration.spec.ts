/**
 * Content 集成测试
 * 测试内容发布流程的端到端交互
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ContentService } from '../../src/modules/content/content.service';
import { ContentController } from '../../src/modules/content/content.controller';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockPosts, mockAccounts } from '../fixtures';
import { PostStatus } from '@prisma/client';

describe('Content 集成测试', () => {
  let contentService: ContentService;
  let contentController: ContentController;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        ContentService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    contentService = module.get<ContentService>(ContentService);
    contentController = module.get<ContentController>(ContentController);
  });

  beforeEach(() => {
    resetPrismaMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 创建内容 API 测试 ====================

  describe('POST /content', () => {
    it('应通过 Controller 创建草稿内容', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue({
        ...mockPosts.draft,
        id: 'post-new',
      });

      // Controller 签名: create(dto, userId)
      const result = await contentController.create(
        {
          accountId: 'acc-001',
          title: '新内容',
          content: '内容正文',
          tags: ['测试'],
        },
        'user-001', // @CurrentUser('id')
      );

      expect(result).toHaveProperty('id');
      expect(result.status).toBe(PostStatus.DRAFT);
    });

    it('应能创建定时发布内容', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue({
        ...mockPosts.scheduled,
        status: PostStatus.SCHEDULED,
      });

      const result = await contentService.create(
        {
          accountId: 'acc-001',
          title: '定时内容',
          publishAt: '2024-12-31T12:00:00Z',
        },
        'user-001',
      );

      expect(result.status).toBe(PostStatus.SCHEDULED);
    });
  });

  // ==================== 查询内容列表 API 测试 ====================

  describe('GET /content', () => {
    it('应返回分页的内容列表', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        mockPosts.draft,
        mockPosts.scheduled,
        mockPosts.published,
      ]);
      mockPrismaService.post.count.mockResolvedValue(3);

      // Controller 签名: findAll(accountId?, status?, skip?, take?, userId?)
      const result = await contentController.findAll(
        undefined, // accountId
        undefined, // status
        undefined, // skip
        undefined, // take
        'user-001', // userId
      );

      expect(result.posts).toHaveLength(3);
      expect(result.total).toBe(3);
    });
  });

  // ==================== 查询单个内容 API 测试 ====================

  describe('GET /content/:id', () => {
    it('应返回内容详情', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.published);

      const result = await contentController.findOne('post-003');

      expect(result).toHaveProperty('id', 'post-003');
      expect(result).toHaveProperty('stats');
    });
  });

  // ==================== 发布流程测试 ====================

  describe('发布流程', () => {
    describe('草稿发布', () => {
      it('应能将草稿状态转为发布中', async () => {
        mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
        mockPrismaService.post.update.mockResolvedValue({
          ...mockPosts.draft,
          status: PostStatus.PUBLISHING,
        });

        // Controller 签名: publish(id, userId)
        const result = await contentController.publish('post-001', 'user-001');

        expect(result.status).toBe(PostStatus.PUBLISHING);
      });
    });

    describe('定时发布', () => {
      it('应能将定时状态转为发布中', async () => {
        mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.scheduled);
        mockPrismaService.post.update.mockResolvedValue({
          ...mockPosts.scheduled,
          status: PostStatus.PUBLISHING,
        });

        const result = await contentController.publish('post-002', 'user-001');

        expect(result.status).toBe(PostStatus.PUBLISHING);
      });
    });

    describe('失败重试', () => {
      it('应能重新发布失败的内容', async () => {
        mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.failed);
        mockPrismaService.post.update.mockResolvedValue({
          ...mockPosts.failed,
          status: PostStatus.PUBLISHING,
        });

        const result = await contentController.publish('post-004', 'user-001');

        expect(result.status).toBe(PostStatus.PUBLISHING);
      });
    });

    describe('状态回调', () => {
      it('浏览器服务应能回调更新发布状态为成功', async () => {
        mockPrismaService.post.update.mockResolvedValue({
          ...mockPosts.published,
          status: PostStatus.PUBLISHED,
          platformUrl: 'https://douyin.com/video/new',
        });

        const result = await contentService.updatePublishStatus(
          'post-001',
          PostStatus.PUBLISHED,
          'https://douyin.com/video/new',
        );

        expect(result.status).toBe(PostStatus.PUBLISHED);
        expect(result.platformUrl).toBe('https://douyin.com/video/new');
      });

      it('浏览器服务应能回调更新发布状态为失败', async () => {
        mockPrismaService.post.update.mockResolvedValue({
          ...mockPosts.failed,
          status: PostStatus.FAILED,
          errorMsg: 'Cookie已过期',
        });

        const result = await contentService.updatePublishStatus(
          'post-001',
          PostStatus.FAILED,
          undefined,
          'Cookie已过期',
        );

        expect(result.status).toBe(PostStatus.FAILED);
        expect(result.errorMsg).toBe('Cookie已过期');
      });
    });
  });

  // ==================== 更新内容 API 测试 ====================

  describe('PUT /content/:id', () => {
    it('应能更新草稿内容', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.draft,
        title: '更新后的标题',
      });

      // Controller 签名: update(id, dto, userId)
      const result = await contentController.update(
        'post-001',
        { title: '更新后的标题' },
        'user-001',
      );

      expect(result.title).toBe('更新后的标题');
    });

    it('已发布内容不能修改', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.published);

      await expect(
        contentController.update('post-003', { title: '尝试修改' }, 'user-001'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== 删除内容 API 测试 ====================

  describe('DELETE /content/:id', () => {
    it('应能删除草稿内容', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.delete.mockResolvedValue(mockPosts.draft);

      // Controller 签名: remove(id, userId)
      const result = await contentController.remove('post-001', 'user-001');

      expect(result).toEqual({ success: true });
    });

    it('发布中的内容不能删除', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.publishing);

      await expect(
        contentController.remove('post-005', 'user-001'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==================== 完整发布生命周期测试 ====================

  describe('完整发布生命周期', () => {
    it('应支持 创建草稿 -> 编辑 -> 定时 -> 发布 -> 回调成功 的完整流程', async () => {
      // 1. 创建草稿
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue({
        ...mockPosts.draft,
        id: 'post-lifecycle',
      });

      const draft = await contentService.create(
        {
          accountId: 'acc-001',
          title: '生命周期测试',
          content: '测试内容',
        },
        'user-001',
      );
      expect(draft.status).toBe(PostStatus.DRAFT);

      // 2. 编辑内容
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPosts.draft,
        id: 'post-lifecycle',
      });
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.draft,
        id: 'post-lifecycle',
        title: '编辑后的标题',
      });

      const edited = await contentService.update(
        'post-lifecycle',
        { title: '编辑后的标题' },
        'user-001',
      );
      expect(edited.title).toBe('编辑后的标题');

      // 3. 设置定时发布
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPosts.draft,
        id: 'post-lifecycle',
      });
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.scheduled,
        id: 'post-lifecycle',
        status: PostStatus.SCHEDULED,
      });

      const scheduled = await contentService.update(
        'post-lifecycle',
        { publishAt: '2024-12-31T12:00:00Z' },
        'user-001',
      );
      expect(scheduled.status).toBe(PostStatus.SCHEDULED);

      // 4. 触发发布
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPosts.scheduled,
        id: 'post-lifecycle',
      });
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.scheduled,
        id: 'post-lifecycle',
        status: PostStatus.PUBLISHING,
      });

      const publishing = await contentService.publish('post-lifecycle', 'user-001');
      expect(publishing.status).toBe(PostStatus.PUBLISHING);

      // 5. 回调发布成功
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.published,
        id: 'post-lifecycle',
        status: PostStatus.PUBLISHED,
        platformUrl: 'https://douyin.com/video/lifecycle',
      });

      const published = await contentService.updatePublishStatus(
        'post-lifecycle',
        PostStatus.PUBLISHED,
        'https://douyin.com/video/lifecycle',
      );
      expect(published.status).toBe(PostStatus.PUBLISHED);
      expect(published.platformUrl).toContain('lifecycle');
    });

    it('应支持 发布失败 -> 重试 -> 成功 的流程', async () => {
      // 1. 发布失败
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.failed);

      // 2. 重试发布
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.failed);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.failed,
        status: PostStatus.PUBLISHING,
      });

      const retrying = await contentService.publish('post-004', 'user-001');
      expect(retrying.status).toBe(PostStatus.PUBLISHING);

      // 3. 重试成功
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.published,
        status: PostStatus.PUBLISHED,
        platformUrl: 'https://douyin.com/video/retry-success',
      });

      const success = await contentService.updatePublishStatus(
        'post-004',
        PostStatus.PUBLISHED,
        'https://douyin.com/video/retry-success',
      );
      expect(success.status).toBe(PostStatus.PUBLISHED);
    });
  });
});
