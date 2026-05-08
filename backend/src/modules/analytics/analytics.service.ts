import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
import { Platform, Prisma } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 获取每日统计数据
   */
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
   * 获取内容表现统计
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
   * 获取聚合概览数据
   */
  async getOverview(userId: string) {
    // 获取用户的所有账号
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      select: { id: true, platform: true, followers: true, status: true },
    });

    const accountIds = accounts.map((a) => a.id);

    // 内容统计
    const [totalPosts, publishedPosts, failedPosts] = await Promise.all([
      this.prisma.post.count({ where: { accountId: { in: accountIds } } }),
      this.prisma.post.count({
        where: { accountId: { in: accountIds }, status: 'PUBLISHED' },
      }),
      this.prisma.post.count({
        where: { accountId: { in: accountIds }, status: 'FAILED' },
      }),
    ]);

    // 累计互动数据
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

    // 按平台分组账号数
    const platformCounts: Record<string, number> = {};
    accounts.forEach((a) => {
      platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1;
    });

    // 总粉丝数
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
   * 获取平台维度对比数据
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
   * 生成数据报表
   */
  async generateReport(userId: string, params: {
    startDate?: Date;
    endDate?: Date;
    platform?: string;
  }) {
    const { startDate, endDate, platform } = params;

    // 默认最近30天
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

    // 每日数据趋势
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

    // 内容表现 Top 10
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

    // 汇总
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
}
