import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
import { Platform } from '../../common/prisma-enums'
import { Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  async getFollowersTrend(userId: string, days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const stats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accountIds },
        date: { gte: startDate },
      },
      select: { date: true, followers: true },
      orderBy: { date: 'asc' },
    });

    const byDate: Record<string, number> = {};
    for (const s of stats) {
      const key = s.date.toISOString().slice(0, 10);
      byDate[key] = (byDate[key] || 0) + s.followers;
    }

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push({ value: byDate[key] || 0 });
    }
    return result;
  }

  /**
   * 鑾峰彇姣忔棩缁熻鏁版嵁
   */
  async createManualMonetization(userId: string, dto: {
    date: string; platform: string; revenue?: number; gmv?: number;
    orders?: number; buyerCount?: number; commission?: number;
    avgOrderValue?: number;
  }) {
    const account = await this.prisma.account.findFirst({
      where: { userId, platform: dto.platform as Platform },
      select: { id: true },
    });
    if (!account) throw new Error('未找到该平台的账号');

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const data: any = {};
    if (dto.revenue !== undefined) data.revenue = dto.revenue;
    if (dto.gmv !== undefined) data.gmv = dto.gmv;
    if (dto.orders !== undefined) data.orders = dto.orders;
    if (dto.buyerCount !== undefined) data.buyerCount = dto.buyerCount;
    if (dto.commission !== undefined) data.commission = dto.commission;
    if (dto.avgOrderValue !== undefined) data.avgOrderValue = dto.avgOrderValue;

    return this.prisma.dailyStats.upsert({
      where: { accountId_date: { accountId: account.id, date } },
      create: { accountId: account.id, date, platform: dto.platform as Platform, ...data },
      update: data,
    });
  }

  async getDailyStats(dto: QueryAnalyticsDto) {
    const where: Prisma.DailyStatsWhereInput = {};

    if (dto.accountId) where.accountId = dto.accountId;
    if (dto.platform) where.platform = dto.platform;

    if (dto.startDate || dto.endDate) {
      where.date = {};
      if (dto.startDate) where.date.gte = new Date(dto.startDate);
      if (dto.endDate) where.date.lte = new Date(dto.endDate);
    }

    const stats = await this.prisma.dailyStats.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        account: {
          select: {
            id: true,
            platform: true,
            nickname: true,
          },
        },
      },
    });

    return stats;
  }

  /**
   * 鑾峰彇鍐呭琛ㄧ幇缁熻
   */
  async getPostStats(dto: QueryAnalyticsDto) {
    const where: Prisma.PostStatsWhereInput = {};

    if (dto.accountId || dto.platform) {
      where.post = {};
      if (dto.accountId) where.post.accountId = dto.accountId;
      if (dto.platform) {
        where.post.account = { platform: dto.platform };
      }
    }

    const stats = await this.prisma.postStats.findMany({
      where,
      include: {
        post: {
          select: {
            id: true,
            title: true,
            status: true,
            platformUrl: true,
            account: {
              select: {
                id: true,
                platform: true,
                nickname: true,
              },
            },
          },
        },
      },
      orderBy: { collectedAt: 'desc' },
    });

    return stats;
  }

  /**
   * 鑾峰彇鑱氬悎姒傝鏁版嵁
   */
  async getOverview(userId: string) {
    // 鑾峰彇鐢ㄦ埛鐨勬墍鏈夎处鍙?
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: { id: true, platform: true, followers: true, status: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // 鍐呭缁熻
    const [totalPosts, publishedPosts, failedPosts] = await Promise.all([
      this.prisma.post.count({ where: { accountId: { in: accountIds } } }),
      this.prisma.post.count({
        where: { accountId: { in: accountIds }, status: 'PUBLISHED' },
      }),
      this.prisma.post.count({
        where: { accountId: { in: accountIds }, status: 'FAILED' },
      }),
    ]);

    // 绱浜掑姩鏁版嵁
    const statsAgg = await this.prisma.postStats.aggregate({
      where: { post: { accountId: { in: accountIds } } },
      _sum: {
        views: true,
        likes: true,
        comments: true,
        shares: true,
        saves: true,
      },
    });

    // 鎸夊钩鍙板垎缁勮处鍙锋暟
    const platformCounts: Record<string, number> = {};
    accounts.forEach((a) => {
      platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1;
    });

    // 鎬荤矇涓濇暟
    const totalFollowers = accounts.reduce((sum, a) => sum + a.followers, 0);

    return {
      accounts: {
        total: accounts.length,
        active: accounts.filter((a) => a.status === 'ACTIVE').length,
        byPlatform: platformCounts,
        totalFollowers,
      },
      posts: {
        total: totalPosts,
        published: publishedPosts,
        failed: failedPosts,
      },
      engagement: {
        totalViews: statsAgg._sum.views || 0,
        totalLikes: statsAgg._sum.likes || 0,
        totalComments: statsAgg._sum.comments || 0,
        totalShares: statsAgg._sum.shares || 0,
        totalSaves: statsAgg._sum.saves || 0,
      },
    };
  }

  /**
   * 鑾峰彇骞冲彴缁村害瀵规瘮鏁版嵁
   */
  async getPlatformComparison(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: { id: true, platform: true },
    });

    const platforms = [...new Set(accounts.map((a) => a.platform))];
    const result: Record<string, any> = {};

    for (const platform of platforms) {
      const platformAccountIds = accounts
        .filter((a) => a.platform === platform)
        .map((a) => a.id);

      const [postCount, statsAgg] = await Promise.all([
        this.prisma.post.count({
          where: {
            accountId: { in: platformAccountIds },
            status: 'PUBLISHED',
          },
        }),
        this.prisma.postStats.aggregate({
          where: { post: { accountId: { in: platformAccountIds } } },
          _sum: { views: true, likes: true, comments: true, shares: true },
        }),
      ]);

      result[platform] = {
        accountCount: platformAccountIds.length,
        publishedPosts: postCount,
        views: statsAgg._sum.views || 0,
        likes: statsAgg._sum.likes || 0,
        comments: statsAgg._sum.comments || 0,
        shares: statsAgg._sum.shares || 0,
      };
    }

    return result;
  }

  /**
   * 鐢熸垚鏁版嵁鎶ヨ〃
   */
  async generateReport(userId: string, params: {
    startDate?: Date;
    endDate?: Date;
    platform?: string;
  }) {
    const { startDate, endDate, platform } = params;

    // 榛樿鏈€杩?0澶?
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    const accounts = await this.prisma.account.findMany({
      where: {
        userId,
        ...(platform ? { platform: platform as Platform } : {}),
      },
      select: { id: true, platform: true, nickname: true, followers: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // 姣忔棩鏁版嵁瓒嬪娍
    const dailyStats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accountIds },
        date: { gte: start, lte: end },
      },
      orderBy: { date: 'asc' },
      include: {
        account: { select: { nickname: true, platform: true } },
      },
    });

    // 鍐呭琛ㄧ幇 Top 10
    const topPosts = await this.prisma.post.findMany({
      where: {
        accountId: { in: accountIds },
        status: 'PUBLISHED',
        createdAt: { gte: start, lte: end },
      },
      include: {
        stats: true,
        account: { select: { nickname: true, platform: true } },
      },
      orderBy: { stats: { views: 'desc' } },
      take: 10,
    });

    // 姹囨€?
    const overview = await this.getOverview(userId);

    return {
      period: { start, end },
      overview,
      accounts: accounts.map((a) => ({
        ...a,
        dailyStats: dailyStats.filter((d) => d.accountId === a.id),
      })),
      topPosts: topPosts.map((p) => ({
        id: p.id,
        title: p.title,
        platform: p.account.platform,
        account: p.account.nickname,
        views: p.stats?.views || 0,
        likes: p.stats?.likes || 0,
        comments: p.stats?.comments || 0,
        shares: p.stats?.shares || 0,
        publishedAt: p.updatedAt,
      })),
      dailyTrend: dailyStats,
    };
  }

  /**
   * 鏁版嵁鍚屾瘮鐜瘮瀵规瘮
   * 杩斿洖鏈懆vs涓婂懆銆佹湰鏈坴s涓婃湀銆佹湰鏈坴s鍘诲勾鍚屾湀鐨勬牳蹇冩寚鏍囧姣?
   */
  async getComparison(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    const now = new Date();

    // 鏈懆锛堝懆涓€鍒颁粖澶╋級
    const thisWeekStart = this.getWeekStart(now);
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);

    // 鏈湀
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);

    // 鍘诲勾鍚屾湀
    const lastYearSameMonthStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    const lastYearSameMonthEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);

    const [thisWeek, lastWeek, thisMonth, lastMonth, lastYearSameMonth] = await Promise.all([
      this.aggregateStats(accountIds, thisWeekStart, now),
      this.aggregateStats(accountIds, lastWeekStart, lastWeekEnd),
      this.aggregateStats(accountIds, thisMonthStart, now),
      this.aggregateStats(accountIds, lastMonthStart, lastMonthEnd),
      this.aggregateStats(accountIds, lastYearSameMonthStart, lastYearSameMonthEnd),
    ]);

    return {
      weekOverWeek: {
        current: thisWeek,
        previous: lastWeek,
        change: this.calcChange(thisWeek, lastWeek),
      },
      monthOverMonth: {
        current: thisMonth,
        previous: lastMonth,
        change: this.calcChange(thisMonth, lastMonth),
      },
      yearOverYear: {
        current: thisMonth,
        previous: lastYearSameMonth,
        change: this.calcChange(thisMonth, lastYearSameMonth),
      },
    };
  }

  /**
   * 鎾斁閲忔鍗?鈥?鎸夋挱鏀鹃噺鎺掑悕鐨勮棰戝垪琛?
   */
  async getViewsRanking(userId: string, params: {
    limit?: number;
    period?: 'week' | 'month' | 'all';
    platform?: string;
  }) {
    const { limit = 50, period = 'all', platform } = params;

    const accounts = await this.prisma.account.findMany({
      where: {
        userId,
        ...(platform ? { platform: platform as Platform } : {}),
      },
      select: { id: true },
    });
    const accountIds = accounts.map((a) => a.id);

    // 鏃堕棿鑼冨洿
    let dateFilter: Prisma.PostWhereInput = {};
    const now = new Date();
    if (period === 'week') {
      dateFilter = { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } };
    } else if (period === 'month') {
      dateFilter = { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } };
    }

    const posts = await this.prisma.post.findMany({
      where: {
        accountId: { in: accountIds },
        status: 'PUBLISHED',
        stats: { isNot: null },
        ...dateFilter,
      },
      include: {
        stats: true,
        account: {
          select: { id: true, nickname: true, platform: true, avatar: true },
        },
      },
      orderBy: { stats: { views: 'desc' } },
      take: limit,
    });

    return {
      ranking: posts.map((p, index) => ({
        rank: index + 1,
        postId: p.id,
        title: p.title,
        platform: p.account.platform,
        accountName: p.account.nickname,
        accountAvatar: p.account.avatar,
        views: p.stats?.views || 0,
        likes: p.stats?.likes || 0,
        comments: p.stats?.comments || 0,
        shares: p.stats?.shares || 0,
        publishedAt: p.updatedAt,
      })),
      total: posts.length,
      period,
    };
  }

  /**
   * 鑱氬悎鎸囧畾鏃堕棿娈靛唴鐨勬牳蹇冩寚鏍?
   */
  private async aggregateStats(accountIds: string[], start: Date, end: Date) {
    if (accountIds.length === 0) {
      return { views: 0, likes: 0, comments: 0, shares: 0, followers: 0, posts: 0 };
    }

    const [dailyAgg, postCount] = await Promise.all([
      this.prisma.dailyStats.aggregate({
        where: {
          accountId: { in: accountIds },
          date: { gte: start, lte: end },
        },
        _sum: { views: true, likes: true, comments: true, shares: true },
      }),
      this.prisma.post.count({
        where: {
          accountId: { in: accountIds },
          status: 'PUBLISHED',
          updatedAt: { gte: start, lte: end },
        },
      }),
    ]);

    // 绮変笣澧為暱 = 鏈熸湯 - 鏈熷垵
    const [latestFollowers, earliestFollowers] = await Promise.all([
      this.prisma.dailyStats.findFirst({
        where: { accountId: { in: accountIds }, date: { lte: end } },
        orderBy: { date: 'desc' },
        select: { followers: true },
      }),
      this.prisma.dailyStats.findFirst({
        where: { accountId: { in: accountIds }, date: { gte: start } },
        orderBy: { date: 'asc' },
        select: { followers: true },
      }),
    ]);

    const followerGrowth = (latestFollowers?.followers || 0) - (earliestFollowers?.followers || 0);

    return {
      views: dailyAgg._sum.views || 0,
      likes: dailyAgg._sum.likes || 0,
      comments: dailyAgg._sum.comments || 0,
      shares: dailyAgg._sum.shares || 0,
      followers: Math.max(0, followerGrowth),
      posts: postCount,
    };
  }

  /**
   * 璁＄畻鍙樺寲鐜?
   */
  private calcChange(current: Record<string, number>, previous: Record<string, number>) {
    const result: Record<string, number | null> = {};
    for (const key of Object.keys(current)) {
      const cur = current[key] || 0;
      const prev = previous[key] || 0;
      if (prev === 0) {
        result[key] = cur > 0 ? 100 : 0;
      } else {
        result[key] = Math.round(((cur - prev) / prev) * 100);
      }
    }
    return result;
  }

  /**
   * 鑾峰彇鏈懆涓€鐨勬棩鏈燂紙UTC+8 涓浗鏃跺尯锛?
   */
  private getWeekStart(date: Date): Date {
    // 杞崲涓?UTC+8
    const utc8Offset = 8 * 60 * 60 * 1000;
    const localTime = new Date(date.getTime() + utc8Offset);
    const day = localTime.getUTCDay();
    const diff = localTime.getUTCDate() - day + (day === 0 ? -6 : 1);
    localTime.setUTCDate(diff);
    localTime.setUTCHours(0, 0, 0, 0);
    // 杞洖 UTC
    return new Date(localTime.getTime() - utc8Offset);
  }
}
