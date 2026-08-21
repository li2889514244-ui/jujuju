/**
 * AnalyticsService 单元测试
 * 测试数据分析服务的核心功能：每日统计、内容表现、聚合概览、平台对比
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockAccounts, mockStats } from '../fixtures';
import { Platform } from '../../src/common/prisma-enums';

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

    it('应支持概览按平台筛选', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.postStats.aggregate.mockResolvedValue({ _sum: {} });

      await service.getOverview('user-001', undefined, Platform.DOUYIN);

      expect(mockPrismaService.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platform: Platform.DOUYIN }),
        }),
      );
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
        { id: 'acc-001', platform: Platform.DOUYIN, followers: 0, likes: 0 },
        { id: 'acc-002', platform: Platform.XIAOHONGSHU, followers: 0, likes: 0 },
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

      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ platform: Platform.DOUYIN }),
          expect.objectContaining({ platform: Platform.XIAOHONGSHU }),
        ]),
      );
    });

    it('每个平台应包含正确的统计数据', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        { id: 'acc-001', platform: Platform.DOUYIN, followers: 0, likes: 0 },
      ]);
      mockPrismaService.post.count.mockResolvedValue(10);
      mockPrismaService.postStats.aggregate.mockResolvedValue({
        _sum: { views: 30000, likes: 2000, comments: 500, shares: 200 },
      });

      const result = await service.getPlatformComparison('user-001');

      expect(result[0]).toEqual({
        platform: Platform.DOUYIN,
        accounts: 1,
        followers: 0,
        likes: 2000,
        publishes: 10,
        views: 30000,
        comments: 500,
        shares: 200,
        saves: 0,
        engagementRate: 9,
      });
    });

    it('无账号时应返回空数组', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);

      const result = await service.getPlatformComparison('user-001');

      expect(result).toEqual([]);
    });

    it('应支持平台对比按平台筛选', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);

      await service.getPlatformComparison('user-001', undefined, Platform.DOUYIN);

      expect(mockPrismaService.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platform: Platform.DOUYIN }),
        }),
      );
    });

    it('统计数据为 null 时应返回 0', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        { id: 'acc-001', platform: Platform.DOUYIN, followers: 0, likes: 0 },
      ]);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.postStats.aggregate.mockResolvedValue({
        _sum: { views: null, likes: null, comments: null, shares: null },
      });

      const result = await service.getPlatformComparison('user-001');

      expect(result[0].views).toBe(0);
      expect(result[0].likes).toBe(0);
    });
  });

  describe('getComparison', () => {
    it('应支持环比数据按平台筛选', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);

      await service.getComparison('user-001', undefined, Platform.DOUYIN);

      expect(mockPrismaService.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platform: Platform.DOUYIN }),
        }),
      );
    });
  });

  // ==================== 账号周期明细测试 ====================

  describe('getAccountDetailList', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-18T04:00:00Z').getTime());
    });

    it('应优先使用 DailyStats 历史聚合，避免重复 metadata 覆盖周/月数据', async () => {
      const duplicateMetric = {
        play: 999,
        like: 88,
        comment: 77,
        share: 66,
        new_fans: 55,
      };
      mockPrismaService.account.findMany.mockResolvedValue([
        {
          id: 'acc-001',
          platform: Platform.DOUYIN,
          nickname: '视频号测试',
          avatar: null,
          followers: 220,
          metadata: JSON.stringify({
            periodMetrics: {
              videoData: {
                day_total: duplicateMetric,
                week_total: duplicateMetric,
                month_total: duplicateMetric,
              },
            },
          }),
        },
      ]);
      mockPrismaService.dailyStats.findMany.mockResolvedValue([
        {
          accountId: 'acc-001',
          date: new Date('2026-06-05T16:00:00.000Z'),
          followers: 160,
          viewsIncrement: 30,
          likesIncrement: 3,
          commentsIncrement: 3,
          sharesIncrement: 3,
          followersIncrement: 3,
        },
        {
          accountId: 'acc-001',
          date: new Date('2026-06-15T16:00:00.000Z'),
          followers: 170,
          viewsIncrement: 20,
          likesIncrement: 2,
          commentsIncrement: 2,
          sharesIncrement: 2,
          followersIncrement: 2,
        },
        {
          accountId: 'acc-001',
          date: new Date('2026-06-16T16:00:00.000Z'),
          followers: 200,
          viewsIncrement: 10,
          likesIncrement: 1,
          commentsIncrement: 1,
          sharesIncrement: 1,
          followersIncrement: 1,
        },
      ]);

      const result = await service.getAccountDetailList('user-001');

      expect(result[0].fans).toBe(220);
      expect(result[0].info.day_total!.play).toBe(10);
      expect(result[0].info.week_total!.play).toBe(30);
      expect(result[0].info.month_total!.play).toBe(60);
    });

    it('DailyStats 缺少长周期历史时，不用 metadata 伪装近期数据', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        {
          id: 'acc-001',
          platform: Platform.WECHAT_VIDEO,
          nickname: '视频号测试',
          avatar: null,
          followers: 100,
          metadata: JSON.stringify({
            periodMetrics: {
              videoData: {
                day_total: { play: 10, like: 1, comment: 1, share: 1, new_fans: 1 },
                week_total: { play: 40, like: 4, comment: 4, share: 4, new_fans: 4 },
                month_total: { play: 100, like: 10, comment: 10, share: 10, new_fans: 10 },
              },
            },
          }),
        },
      ]);
      mockPrismaService.dailyStats.findMany.mockResolvedValue([
        {
          accountId: 'acc-001',
          date: new Date('2026-06-16T16:00:00.000Z'),
          followers: 120,
          viewsIncrement: 10,
          likesIncrement: 1,
          commentsIncrement: 1,
          sharesIncrement: 1,
          followersIncrement: 1,
        },
      ]);

      const result = await service.getAccountDetailList('user-001');

      expect(result[0].info.day_total).toBeNull();
      expect(result[0].info.week_total).toBeNull();
      expect(result[0].info.month_total).toBeNull();
      expect(result[0].dataDate).toBe('2026-06-17');
    });

    it('uses new companion periodMetrics for WeChat Video day/week/month dashboard values', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        {
          id: 'acc-001',
          platform: Platform.WECHAT_VIDEO,
          nickname: 'video account',
          avatar: 'https://wx.qlogo.cn/finderhead/avatar/0',
          followers: 1258566,
          metadata: JSON.stringify({
            periodMetrics: {
              videoData: {
                day_total: { play: 172804, like: 639, comment: 176, share: 698, new_fans: 188 },
                week_total: { play: 1553909, like: 5024, comment: 1314, share: 7075, new_fans: 1606 },
                month_total: { play: 269000, like: 1702, comment: 663, share: 698, new_fans: 518 },
                source: 'new_post_total_data_api',
              },
              followerData: {
                day_total: { new_fans: 1258566, unfollows: 0, net_fans: 1258566 },
                week_total: { new_fans: 1258566, unfollows: 0, net_fans: 1258566 },
                month_total: { new_fans: 518, unfollows: 0, net_fans: 518 },
                source: 'channels_data_center_follower_data',
              },
            },
          }),
        },
      ]);
      mockPrismaService.dailyStats.findMany.mockResolvedValue([
        {
          accountId: 'acc-001',
          date: new Date('2026-06-16T16:00:00.000Z'),
          followers: 1240000,
          viewsIncrement: 10,
          likesIncrement: 1,
          commentsIncrement: 1,
          sharesIncrement: 1,
          followersIncrement: 1,
        },
      ]);

      const result = await service.getAccountDetailList('user-001');

      expect(result[0].info.day_total).toEqual({
        play: 172804,
        like: 639,
        comment: 176,
        share: 698,
        new_fans: 188,
      });
      expect(result[0].info.week_total).toEqual({
        play: 1553909,
        like: 5024,
        comment: 1314,
        share: 7075,
        new_fans: 1606,
      });
      expect(result[0].info.month_total).toEqual({
        play: 269000,
        like: 1702,
        comment: 663,
        share: 698,
        new_fans: 518,
      });
    });

    it('当前粉丝优先使用 Account 最新快照，不被 DailyStats 历史快照覆盖', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        {
          id: 'acc-001',
          platform: Platform.WECHAT_VIDEO,
          nickname: '视频号测试',
          avatar: null,
          followers: 1247851,
          metadata: null,
        },
      ]);
      mockPrismaService.dailyStats.findMany.mockResolvedValue([
        {
          accountId: 'acc-001',
          date: new Date('2026-06-16T16:00:00.000Z'),
          followers: 1247841,
          viewsIncrement: 10,
          likesIncrement: 1,
          commentsIncrement: 1,
          sharesIncrement: 1,
          followersIncrement: 1,
        },
      ]);

      const result = await service.getAccountDetailList('user-001');

      expect(result[0].fans).toBe(1247851);
      expect(result[0].dataDate).toBe('2026-06-17');
    });
  });

  describe('analytics day range normalization', () => {
    it('falls back to the default follower trend window for non-finite days', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);

      const result = await service.getFollowersTrend('user-001', Infinity);

      expect(result).toHaveLength(7);
      expect(result.every((item) => Number.isFinite(item.value))).toBe(true);
    });

    it('floors fractional days before building trend arrays', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);
      mockPrismaService.dailyStats.findMany.mockResolvedValue([]);

      const result = await service.getLikesTrend('user-001', 2.8);

      expect(result).toHaveLength(2);
      expect(mockPrismaService.dailyStats.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            date: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('omits optional publish-effect date filters for non-finite days', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);
      mockPrismaService.post.findMany.mockResolvedValue([]);

      await service.getPublishEffect('user-001', Infinity);

      expect(mockPrismaService.post.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ createdAt: expect.anything() }),
        }),
      );
    });
  });
});
