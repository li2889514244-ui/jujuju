/**
 * ContentService 单元测试
 * 测试内容服务的核心功能：CRUD 操作、发布状态机、定时发布队列
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ContentService } from '../../src/modules/content/content.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockPosts, mockAccounts, mockUsers } from '../fixtures';
import { PostStatus } from '@prisma/client';

describe('ContentService', () => {
  let service: ContentService;

  beforeEach(async () => {
    resetPrismaMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ContentService>(ContentService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 创建内容测试 ====================

  describe('create', () => {
    const createDto = {
      accountId: 'acc-001',
      title: '新内容标题',
      content: '新内容正文',
      mediaUrls: ['https://example.com/video.mp4'],
      tags: ['测试', '视频'],
    };

    it('应该成功创建草稿内容', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue({
        ...mockPosts.draft,
        ...createDto,
        id: 'post-new',
        status: PostStatus.DRAFT,
      });

      const result = await service.create(createDto, 'user-001');

      expect(result).toHaveProperty('id');
      expect(result.status).toBe(PostStatus.DRAFT);
    });

    it('指定发布时间时应创建定时内容', async () => {
      const scheduledDto = {
        ...createDto,
        publishAt: '2024-12-31T12:00:00Z',
      };

      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue({
        ...mockPosts.scheduled,
        ...scheduledDto,
      });

      const result = await service.create(scheduledDto, 'user-001');

      expect(result.status).toBe(PostStatus.SCHEDULED);
    });

    it('关联账号不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto, 'user-001')).rejects.toThrow(NotFoundException);
      await expect(service.create(createDto, 'user-001')).rejects.toThrow('关联账号不存在');
    });

    it('无权为他人账号创建内容时应抛出 ForbiddenException', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        userId: 'user-other',
      });

      await expect(service.create(createDto, 'user-001')).rejects.toThrow(ForbiddenException);
      await expect(service.create(createDto, 'user-001')).rejects.toThrow('无权为此账号创建内容');
    });

    it('创建时应关联到正确的账号', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue(mockPosts.draft);

      await service.create(createDto, 'user-001');

      const createCall = mockPrismaService.post.create.mock.calls[0][0];
      expect(createCall.data.accountId).toBe('acc-001');
    });

    it('标签为空时应使用空数组', async () => {
      const dtoNoTags = { ...createDto, tags: undefined };
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.post.create.mockResolvedValue(mockPosts.draft);

      await service.create(dtoNoTags, 'user-001');

      const createCall = mockPrismaService.post.create.mock.calls[0][0];
      expect(createCall.data.tags).toEqual([]);
    });
  });

  // ==================== 查询内容列表测试 ====================

  describe('findAll', () => {
    it('应该返回分页的内容列表', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([
        mockPosts.draft,
        mockPosts.scheduled,
      ]);
      mockPrismaService.post.count.mockResolvedValue(2);

      const result = await service.findAll({ userId: 'user-001' });

      expect(result.posts).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('应支持按状态筛选', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([mockPosts.draft]);
      mockPrismaService.post.count.mockResolvedValue(1);

      await service.findAll({ userId: 'user-001', status: PostStatus.DRAFT });

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: PostStatus.DRAFT }),
        }),
      );
    });

    it('应支持按账号 ID 筛选', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([mockPosts.draft]);
      mockPrismaService.post.count.mockResolvedValue(1);

      await service.findAll({ accountId: 'acc-001' });

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ accountId: 'acc-001' }),
        }),
      );
    });

    it('应支持分页参数', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);

      await service.findAll({ skip: 10, take: 5 });

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });
  });

  // ==================== 查询单个内容测试 ====================

  describe('findById', () => {
    it('应该返回内容详情', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.published);

      const result = await service.findById('post-003');

      expect(result).toHaveProperty('id', 'post-003');
      expect(result).toHaveProperty('stats');
    });

    it('内容不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findById('nonexistent')).rejects.toThrow('内容不存在');
    });
  });

  // ==================== 更新内容测试 ====================

  describe('update', () => {
    const updateData = { title: '更新后的标题' };

    it('草稿状态的内容可以修改', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.draft,
        ...updateData,
      });

      const result = await service.update('post-001', updateData, 'user-001');

      expect(result.title).toBe('更新后的标题');
    });

    it('定时状态的内容可以修改', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.scheduled);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.scheduled,
        ...updateData,
      });

      const result = await service.update('post-002', updateData, 'user-001');

      expect(result.title).toBe('更新后的标题');
    });

    it('已发布状态的内容不能修改', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.published);

      await expect(
        service.update('post-003', updateData, 'user-001'),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.update('post-003', updateData, 'user-001'),
      ).rejects.toThrow('只有草稿和定时状态的内容可以修改');
    });

    it('发布中的内容不能修改', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.publishing);

      await expect(
        service.update('post-005', updateData, 'user-001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('无权修改他人内容时应抛出 ForbiddenException', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPosts.draft,
        account: { ...mockPosts.draft.account, userId: 'user-other' },
      });

      await expect(
        service.update('post-001', updateData, 'user-001'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('更新发布时间应同步更新状态', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.update.mockResolvedValue(mockPosts.scheduled);

      await service.update('post-001', { publishAt: '2024-12-31T12:00:00Z' }, 'user-001');

      const updateCall = mockPrismaService.post.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(PostStatus.SCHEDULED);
    });

    it('移除发布时间应恢复为草稿状态', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.scheduled);
      mockPrismaService.post.update.mockResolvedValue(mockPosts.draft);

      await service.update('post-002', { publishAt: null }, 'user-001');

      const updateCall = mockPrismaService.post.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(PostStatus.DRAFT);
    });

    it('内容不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', updateData, 'user-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== 删除内容测试 ====================

  describe('remove', () => {
    it('应该成功删除草稿内容', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.delete.mockResolvedValue(mockPosts.draft);

      const result = await service.remove('post-001', 'user-001');

      expect(result).toEqual({ success: true });
      expect(mockPrismaService.post.delete).toHaveBeenCalled();
    });

    it('发布中的内容不能删除', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.publishing);

      await expect(service.remove('post-005', 'user-001')).rejects.toThrow(BadRequestException);
      await expect(service.remove('post-005', 'user-001')).rejects.toThrow('发布中的内容无法删除');
    });

    it('无权删除他人内容时应抛出 ForbiddenException', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPosts.draft,
        account: { ...mockPosts.draft.account, userId: 'user-other' },
      });

      await expect(service.remove('post-001', 'user-001')).rejects.toThrow(ForbiddenException);
    });

    it('内容不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', 'user-001')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== 发布内容测试（状态机） ====================

  describe('publish', () => {
    it('草稿状态的内容可以发布', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.draft);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.draft,
        status: PostStatus.PUBLISHING,
      });

      const result = await service.publish('post-001', 'user-001');

      expect(result.status).toBe(PostStatus.PUBLISHING);
    });

    it('定时状态的内容可以发布', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.scheduled);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.scheduled,
        status: PostStatus.PUBLISHING,
      });

      const result = await service.publish('post-002', 'user-001');

      expect(result.status).toBe(PostStatus.PUBLISHING);
    });

    it('发布失败的内容可以重新发布', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.failed);
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.failed,
        status: PostStatus.PUBLISHING,
      });

      const result = await service.publish('post-004', 'user-001');

      expect(result.status).toBe(PostStatus.PUBLISHING);
    });

    it('已发布状态的内容不能再次发布', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.published);

      await expect(service.publish('post-003', 'user-001')).rejects.toThrow(BadRequestException);
    });

    it('发布中的内容不能重复发布', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(mockPosts.publishing);

      await expect(service.publish('post-005', 'user-001')).rejects.toThrow(BadRequestException);
    });

    it('无权发布他人内容时应抛出 ForbiddenException', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue({
        ...mockPosts.draft,
        account: { ...mockPosts.draft.account, userId: 'user-other' },
      });

      await expect(service.publish('post-001', 'user-001')).rejects.toThrow(ForbiddenException);
    });

    it('内容不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.post.findUnique.mockResolvedValue(null);

      await expect(service.publish('nonexistent', 'user-001')).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== 更新发布状态测试 ====================

  describe('updatePublishStatus', () => {
    it('应能更新为已发布状态', async () => {
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.published,
        status: PostStatus.PUBLISHED,
        platformUrl: 'https://douyin.com/video/new',
      });

      const result = await service.updatePublishStatus(
        'post-001',
        PostStatus.PUBLISHED,
        'https://douyin.com/video/new',
      );

      expect(result.status).toBe(PostStatus.PUBLISHED);
      expect(result.platformUrl).toBe('https://douyin.com/video/new');
    });

    it('应能更新为失败状态并记录错误信息', async () => {
      mockPrismaService.post.update.mockResolvedValue({
        ...mockPosts.failed,
        status: PostStatus.FAILED,
        errorMsg: 'Cookie已过期',
      });

      const result = await service.updatePublishStatus(
        'post-001',
        PostStatus.FAILED,
        undefined,
        'Cookie已过期',
      );

      expect(result.status).toBe(PostStatus.FAILED);
      expect(result.errorMsg).toBe('Cookie已过期');
    });
  });

  // ==================== 定时发布队列测试 ====================

  describe('getScheduledPosts', () => {
    it('应返回到期的定时内容', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([mockPosts.scheduled]);

      const result = await service.getScheduledPosts();

      expect(result).toHaveLength(1);
      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: PostStatus.SCHEDULED,
            publishAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('应包含账号的 Cookie 信息（用于发布）', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([mockPosts.scheduled]);

      await service.getScheduledPosts();

      const findCall = mockPrismaService.post.findMany.mock.calls[0][0];
      expect(findCall.include.account.select).toHaveProperty('cookies');
    });

    it('应按发布时间升序排列', async () => {
      mockPrismaService.post.findMany.mockResolvedValue([]);

      await service.getScheduledPosts();

      const findCall = mockPrismaService.post.findMany.mock.calls[0][0];
      expect(findCall.orderBy).toEqual({ publishAt: 'asc' });
    });
  });

  // ==================== 发布状态机完整性测试 ====================

  describe('发布状态机', () => {
    const validTransitions: [PostStatus, PostStatus][] = [
      [PostStatus.DRAFT, PostStatus.PUBLISHING],
      [PostStatus.SCHEDULED, PostStatus.PUBLISHING],
      [PostStatus.FAILED, PostStatus.PUBLISHING],
      [PostStatus.PUBLISHING, PostStatus.PUBLISHED],
      [PostStatus.PUBLISHING, PostStatus.FAILED],
    ];

    const invalidTransitions: [PostStatus, PostStatus][] = [
      [PostStatus.PUBLISHED, PostStatus.PUBLISHING],
      [PostStatus.PUBLISHED, PostStatus.DRAFT],
      [PostStatus.PUBLISHING, PostStatus.DRAFT],
      [PostStatus.PUBLISHING, PostStatus.SCHEDULED],
    ];

    it.each(validTransitions)(
      '应允许从 %s 转换到 %s',
      async (fromStatus, toStatus) => {
        const post = { ...mockPosts.draft, status: fromStatus };
        mockPrismaService.post.findUnique.mockResolvedValue(post);
        mockPrismaService.post.update.mockResolvedValue({ ...post, status: toStatus });

        if (toStatus === PostStatus.PUBLISHING) {
          const result = await service.publish('post-001', 'user-001');
          expect(result.status).toBe(toStatus);
        }
      },
    );

    it.each(invalidTransitions)(
      '不应允许从 %s 转换到 %s',
      async (fromStatus) => {
        const post = { ...mockPosts.draft, status: fromStatus };
        mockPrismaService.post.findUnique.mockResolvedValue(post);

        await expect(service.publish('post-001', 'user-001')).rejects.toThrow();
      },
    );
  });
});
