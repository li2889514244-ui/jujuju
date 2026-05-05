/**
 * AnalyticsService 单元测试
 * 测试数据分析服务的核心功能：每日统计、内容表现、聚合概览、平台对比
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockAccounts, mockStats } from '../fixtures';
import { Platform } from '@prisma/client';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    resetPrismaMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 每日统计测试 ====================

  describe('getDailyStats', () => {
    it('应该返回每日统计数据', async () => {
      mockPrismaService.dailyStats.findMany.mockResolvedValue(mockStats.dailyStats);

      const result = await service.getDailyStats({ accountId: 'acc-001' });

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('views');
      expect(result[0]).toHaveProperty('likes');
    });

    it('应支持按平台筛选', async () => {
      mockPrismaService.dailyStats.findMany.mockResolvedValue(mockStats.dailyStats);

      await service.getDailyStats({ platform: Platform.DOUYIN });

      expect(mockPrismaService.dailyStats.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platform: Platform.DOUYIN }),
        }),
      );
    });

    it('应支持日期范围筛选', async () => {
      mockPrismaService.dailyStats.findMany.mockResolvedValue([]);

      await service.getDailyStats({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(mockPrismaService.dailyStats.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('应按日期升序排列', async () => {
      mockPrismaService.dailyStats.findMany.mockResolvedValue([]);

      await service.getDailyStats({ accountId: 'acc-001' });

      expect(mockPrismaService.dailyStats.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { date: 'asc' },
        }),
      );
    });

    it('应包含关联的账号信息', async () => {
      mockPrismaService.dailyStats.findMany.mockResolvedValue(mockStats.dailyStats);

      await service.getDailyStats({ accountId: 'acc-001' });

      expect(mockPrismaService.dailyStats.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            account: expect.any(Object),
          }),
        }),
      );
    });

    it('无数据时应返回空数组', async () => {
      mockPrismaService.dailyStats.findMany.mockResolvedValue([]);

      const result = await service.getDailyStats({ accountId: 'nonexistent' });

      expect(result).toEqual([]);
    });
  });

  // ==================== 内容表现统计测试 ====================

  describe('getPostStats', () => {
    it('应该返回内容表现统计', async () => {
      mockPrismaService.postStats.findMany.mockResolvedValue(mockStats.postStats);

      const result = await service.getPostStats({ accountId: 'acc-001' });

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('views', 1000);
      expect(result[0]).toHaveProperty('likes', 100);
    });

    it('应支持按平台筛选', async () => {
      mockPrismaService.postStats.findMany.mockResolvedValue([]);

      await service.getPostStats({ platform: Platform.DOUYIN });

      expect(mockPrismaService.postStats.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            post: expect.objectContaining({
              account: expect.objectContaining({ platform: Platform.DOUYIN }),
            }),
          }),
        }),
      );
    });

    it('应按采集时间降序排列', async () => {
      mockPrismaService.postStats.findMany.mockResolvedValue([]);

      await service.getPostStats({});

      expect(mockPrismaService.postStats.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { collectedAt: 'desc' },
        }),
      );
    });

    it('应包含关联的文章和账号信息', async () => {
      mockPrismaService.postStats.findMany.mockResolvedValue(mockStats.postStats);

      await service.getPostStats({});

      expect(mockPrismaService.postStats.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            post: expect.objectContaining({
              select: expect.objectContaining({
                account: expect.any(Object),
              }),
            }),
          }),
        }),
      );
    });
  });

  // ==================== 聚合概览测试 ====================

  describe('getOverview', () => {
    const mockAccountsList = [
      { id: 'acc-001', platform: Platform.DOUYIN, followers: 10000, status: 'ACTIVE' },
      { id: 'acc-002', platform: Platform.XIAOHONGSHU, followers: 5000, status: 'ACTIVE' },
    ];

    it('应该返回完整的聚合概览数据', async () => {
      mockPrismaService.account.findMany.mockResolvedValue(mockAccountsList);
      mockPrismaService.post.count
        .mockResolvedValueOnce(10) // totalPosts
        .mockResolvedValueOnce(7)  // publishedPosts
        .mockResolvedValueOnce(2); // failedPosts
      mockPrismaService.postStats.aggregate.mockResolvedValue({
        _sum: {
          views: 50000,
          likes: 3000,
          comments: 1000,
          shares: 500,
          saves: 200,
        },
      });

      const result = await service.getOverview('user-001');

      expect(result).toHaveProperty('accounts');
      expect(result).toHaveProperty('posts');
      expect(result).toHaveProperty('engagement');
    });

    it('应正确计算账号总数', async () => {
      mockPrismaService.account.findMany.mockResolvedValue(mockAccountsList);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.postStats.aggregate.mockResolvedValue({ _sum: {} });

      const result = await service.getOverview('user-001');

      expect(result.accounts.total).toBe(2);
    });

    it('应正确计算活跃账号数', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        ...mockAccountsList,
        { id: 'acc-003', platform: Platform.DOUYIN, followers: 0, status: 'BANNED' },
      ]);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.postStats.aggregate.mockResolvedValue({ _sum: {} });

      const result = await service.getOverview('user-001');

      expect(result.accounts.active).toBe(2);
    });

    it('应正确统计总粉丝数', async () => {
      mockPrismaService.account.findMany.mockResolvedValue(mockAccountsList);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.postStats.aggregate.mockResolvedValue({ _sum: {} });

      const result = await service.getOverview('user-001');

      expect(result.accounts.totalFollowers).toBe(15000);
    });

    it('应按平台分组统计账号数', async () => {
      mockPrismaService.account.findMany.mockResolvedValue(mockAccountsList);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.postStats.aggregate.mockResolvedValue({ _sum: {} });

      const result = await service.getOverview('user-001');

      expect(result.accounts.byPlatform).toEqual({
        DOUYIN: 1,
        XIAOHONGSHU: 1,
      });
    });

    it('无数据时各项指标应为 0', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.postStats.aggregate.mockResolvedValue({
        _sum: { views: null, likes: null, comments: null, shares: null, saves: null },
      });

      const result = await service.getOverview('user-001');

      expect(result.accounts.total).toBe(0);
      expect(result.posts.total).toBe(0);
      expect(result.engagement.totalViews).toBe(0);
      expect(result.engagement.totalLikes).toBe(0);
    });

    it('应正确统计内容发布数据', async () => {
      mockPrismaService.account.findMany.mockResolvedValue(mockAccountsList);
      mockPrismaService.post.count
        .mockResolvedValueOnce(20)  // total
        .mockResolvedValueOnce(15)  // published
        .mockResolvedValueOnce(3);  // failed
      mockPrismaService.postStats.aggregate.mockResolvedValue({ _sum: {} });

      const result = await service.getOverview('user-001');

      expect(result.posts.total).toBe(20);
      expect(result.posts.published).toBe(15);
      expect(result.posts.failed).toBe(3);
    });
  });

  // ==================== 平台对比测试 ====================

  describe('getPlatformComparison', () => {
    it('应该返回各平台的对比数据', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        { id: 'acc-001', platform: Platform.DOUYIN },
        { id: 'acc-002', platform: Platform.XIAOHONGSHU },
      ]);
      mockPrismaService.post.count
        .mockResolvedValueOnce(10) // DOUYIN published
        .mockResolvedValueOnce(5); // XIAOHONGSHU published
      mockPrismaService.postStats.aggregate
        .mockResolvedValueOnce({
          _sum: { views: 30000, likes: 2000, comments: 500, shares: 200 },
        })
        .mockResolvedValueOnce({
          _sum: { views: 15000, likes: 1000, comments: 300, shares: 100 },
        });

      const result = await service.getPlatformComparison('user-001');

      expect(result).toHaveProperty(Platform.DOUYIN);
      expect(result).toHaveProperty(Platform.XIAOHONGSHU);
    });

    it('每个平台应包含正确的统计数据', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        { id: 'acc-001', platform: Platform.DOUYIN },
      ]);
      mockPrismaService.post.count.mockResolvedValue(10);
      mockPrismaService.postStats.aggregate.mockResolvedValue({
        _sum: { views: 30000, likes: 2000, comments: 500, shares: 200 },
      });

      const result = await service.getPlatformComparison('user-001');

      expect(result[Platform.DOUYIN]).toEqual({
        accountCount: 1,
        publishedPosts: 10,
        views: 30000,
        likes: 2000,
        comments: 500,
        shares: 200,
      });
    });

    it('无账号时应返回空对象', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);

      const result = await service.getPlatformComparison('user-001');

      expect(result).toEqual({});
    });

    it('统计数据为 null 时应返回 0', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        { id: 'acc-001', platform: Platform.DOUYIN },
      ]);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.postStats.aggregate.mockResolvedValue({
        _sum: { views: null, likes: null, comments: null, shares: null },
      });

      const result = await service.getPlatformComparison('user-001');

      expect(result[Platform.DOUYIN].views).toBe(0);
      expect(result[Platform.DOUYIN].likes).toBe(0);
    });
  });
});
