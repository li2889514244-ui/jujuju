import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { QueryAnalyticsDto } from './dto/query-analytics.dto'
import { Platform } from '../../common/prisma-enums'
import { Prisma } from '@prisma/client'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(private prisma: PrismaService) {}

  async getFollowersTrend(userId: string, days: number = 7, platform?: string, groupId?: string) {
    const safeDays = Math.max(1, Number(days) || 7)
    const endDate = new Date()
    endDate.setHours(0, 0, 0, 0)
    const dateKeys = Array.from({ length: safeDays }, (_, index) => {
      const d = new Date(endDate)
      d.setDate(endDate.getDate() - (safeDays - 1 - index))
      return d.toISOString().slice(0, 10)
    })

    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: {
        ...(platform ? { platform: platform as Platform } : {}),
        ...(groupId ? { groupId } : {}),
      },
      select: { id: true, followers: true },
    })
    const accountIds = accounts.map((a) => a.id)
    if (accountIds.length === 0) {
      return dateKeys.map((date) => ({ date, value: 0 }))
    }

    const stats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accountIds },
        date: { lte: endDate },
      },
      select: { accountId: true, date: true, followers: true },
      orderBy: [{ accountId: 'asc' }, { date: 'asc' }],
    })

    const statsByAccount: Record<string, Array<{ date: string; followers: number }>> = {}
    for (const s of stats) {
      if (!statsByAccount[s.accountId]) statsByAccount[s.accountId] = []
      statsByAccount[s.accountId].push({
        date: s.date.toISOString().slice(0, 10),
        followers: s.followers || 0,
      })
    }

    return dateKeys.map((date) => {
      let value = 0
      for (const account of accounts) {
        const rows = statsByAccount[account.id] || []
        const latestAtOrBefore = [...rows].reverse().find((row) => row.date <= date)
        const firstKnown = rows[0]
        value += latestAtOrBefore?.followers ?? firstKnown?.followers ?? account.followers ?? 0
      }
      return { date, value }
    })
  }

  async getViewsTrend(userId: string, days: number = 7, platform?: string, groupId?: string) {
    const safeDays = Math.max(1, Number(days) || 7)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (safeDays - 1))
    startDate.setHours(0, 0, 0, 0)

    const accounts = await this.prisma.account.findMany({
      where: {
        ...(platform ? { platform: platform as Platform } : {}),
        ...(groupId ? { groupId } : {}),
      },
      select: { id: true },
    })
    const accountIds = accounts.map((a) => a.id)

    const stats = accountIds.length
      ? await this.prisma.dailyStats.findMany({
          where: { accountId: { in: accountIds }, date: { gte: startDate } },
          select: { date: true, views: true, viewsIncrement: true },
          orderBy: { date: 'asc' },
        })
      : []

    const byDate: Record<string, number> = {}
    for (const s of stats) {
      const date = s.date.toISOString().slice(0, 10)
      byDate[date] = (byDate[date] || 0) + (s.viewsIncrement || s.views || 0)
    }

    return Array.from({ length: safeDays }, (_, index) => {
      const d = new Date()
      d.setDate(d.getDate() - (safeDays - 1 - index))
      const date = d.toISOString().slice(0, 10)
      return { date, value: byDate[date] || 0 }
    })
  }

  /**
   * 鑾峰彇姣忔棩缁熻鏁版嵁
   */
  async createManualMonetization(
    userId: string,
    dto: {
      date: string
      platform: string
      revenue?: number
      gmv?: number
      orders?: number
      buyerCount?: number
      commission?: number
      avgOrderValue?: number
    },
  ) {
    // shared mode: 查所有用户的账号
    const account = await this.prisma.account.findFirst({
      where: { platform: dto.platform as Platform },
      select: { id: true },
    })
    if (!account) throw new Error('未找到该平台的账号')

    const date = new Date(dto.date)
    date.setHours(0, 0, 0, 0)

    const data: any = {}
    if (dto.revenue !== undefined) data.revenue = dto.revenue
    if (dto.gmv !== undefined) data.gmv = dto.gmv
    if (dto.orders !== undefined) data.orders = dto.orders
    if (dto.buyerCount !== undefined) data.buyerCount = dto.buyerCount
    if (dto.commission !== undefined) data.commission = dto.commission
    if (dto.avgOrderValue !== undefined) data.avgOrderValue = dto.avgOrderValue

    return this.prisma.dailyStats.upsert({
      where: { accountId_date: { accountId: account.id, date } },
      create: { accountId: account.id, date, platform: dto.platform as Platform, ...data },
      update: data,
    })
  }

  async getDailyStats(dto: QueryAnalyticsDto, userId?: string) {
    const where: Prisma.DailyStatsWhereInput = {}

    if (dto.accountId) where.accountId = dto.accountId
    if (dto.platform) where.platform = dto.platform
    // shared mode: 不按 userId 过滤

    if (dto.startDate || dto.endDate) {
      where.date = {}
      if (dto.startDate) where.date.gte = new Date(dto.startDate)
      if (dto.endDate) where.date.lte = new Date(dto.endDate)
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
    })

    return stats
  }

  /**
   * 鑾峰彇鍐呭琛ㄧ幇缁熻
   */
  async getPostStats(dto: QueryAnalyticsDto, userId?: string) {
    const where: Prisma.PostStatsWhereInput = {}

    where.post = {}
    if (dto.accountId) where.post.accountId = dto.accountId
    // shared mode: 不按 userId 过滤
    if (dto.platform) {
      where.post.account = {
        platform: dto.platform,
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
    })

    return stats
  }

  /**
   * 鑾峰彇鑱氬悎姒傝鏁版嵁
   */
  async getOverview(userId: string, groupId?: string) {
    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: { ...(groupId ? { groupId } : {}) },
      select: { id: true, platform: true, followers: true, likes: true, status: true },
    })

    const accountIds = accounts.map((a) => a.id)

    // 鍐呭缁熻
    const [totalPosts, publishedPosts, failedPosts] = await Promise.all([
      this.prisma.post.count({ where: { accountId: { in: accountIds } } }),
      this.prisma.post.count({
        where: { accountId: { in: accountIds }, status: 'PUBLISHED' },
      }),
      this.prisma.post.count({
        where: { accountId: { in: accountIds }, status: 'FAILED' },
      }),
    ])

    // 绱浜掑姩鏁版嵁
    const statsAgg = await this.prisma.postStats.aggregate({
      where: { post: { accountId: { in: accountIds } } },
      _sum: {
        views: true,
        likes: true,
        comments: true,
        shares: true,
        saves: true,
        danmakuCount: true,
      },
      _avg: {
        completionRate: true,
      },
    })

    // 鎸夊钩鍙板垎缁勮处鍙锋暟
    const platformCounts: Record<string, number> = {}
    accounts.forEach((a) => {
      platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1
    })

    // 鎬荤矇涓濇暟
    const totalFollowers = accounts.reduce((sum, a) => sum + a.followers, 0)
    const totalLikes = accounts.reduce((sum, a) => sum + a.likes, 0)

    return {
      accounts: {
        total: accounts.length,
        active: accounts.filter((a) => a.status === 'ACTIVE').length,
        byPlatform: platformCounts,
        totalFollowers,
        totalLikes,
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
        totalDanmaku: statsAgg._sum.danmakuCount || 0,
        avgCompletionRate: statsAgg._avg.completionRate
          ? Math.round(statsAgg._avg.completionRate * 100) / 100
          : 0,
      },
    }
  }

  /**
   * 鑾峰彇骞冲彴缁村害瀵规瘮鏁版嵁
   */
  async getPlatformComparison(userId: string, groupId?: string) {
    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: { ...(groupId ? { groupId } : {}) },
      select: { id: true, platform: true, followers: true, likes: true },
    })

    const platforms = [...new Set(accounts.map((a) => a.platform))]
    const result: Array<{
      platform: string
      accounts: number
      followers: number
      likes: number
      publishes: number
      views: number
      comments: number
      shares: number
      saves: number
      engagementRate: number
    }> = []

    for (const platform of platforms) {
      const platformAccounts = accounts.filter((a) => a.platform === platform)
      const platformAccountIds = platformAccounts.map((a) => a.id)

      const totalFollowers = platformAccounts.reduce((s, a) => s + a.followers, 0)

      const [postCount, statsAgg] = await Promise.all([
        this.prisma.post.count({
          where: {
            accountId: { in: platformAccountIds },
            status: 'PUBLISHED',
          },
        }),
        this.prisma.postStats.aggregate({
          where: { post: { accountId: { in: platformAccountIds } } },
          _sum: { views: true, likes: true, comments: true, shares: true, saves: true },
        }),
      ])

      const views = statsAgg._sum.views || 0
      const plikes = statsAgg._sum.likes || 0

      result.push({
        platform,
        accounts: platformAccountIds.length,
        followers: totalFollowers,
        likes: plikes,
        publishes: postCount,
        views,
        comments: statsAgg._sum.comments || 0,
        shares: statsAgg._sum.shares || 0,
        saves: statsAgg._sum.saves || 0,
        engagementRate: views > 0 ? Math.round((plikes / views) * 10000) / 100 : 0,
      })
    }

    return result
  }

  /**
   * 鐢熸垚鏁版嵁鎶ヨ〃
   */
  async generateReport(
    userId: string,
    params: {
      startDate?: Date
      endDate?: Date
      platform?: string
    },
  ) {
    const { startDate, endDate, platform } = params

    // 榛樿鏈€杩?0澶?
    const end = endDate || new Date()
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)

    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: {
        ...(platform ? { platform: platform as Platform } : {}),
      },
      select: { id: true, platform: true, nickname: true, followers: true, likes: true },
    })

    const accountIds = accounts.map((a) => a.id)

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
    })

    const [totalPosts, publishedPosts, failedPosts] = await Promise.all([
      this.prisma.post.count({
        where: { accountId: { in: accountIds }, createdAt: { gte: start, lte: end } },
      }),
      this.prisma.post.count({
        where: {
          accountId: { in: accountIds },
          status: 'PUBLISHED',
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.post.count({
        where: {
          accountId: { in: accountIds },
          status: 'FAILED',
          createdAt: { gte: start, lte: end },
        },
      }),
    ])

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
    })

    const postStatsAgg = await this.prisma.postStats.aggregate({
      where: {
        post: {
          accountId: { in: accountIds },
          status: 'PUBLISHED',
          createdAt: { gte: start, lte: end },
        },
      },
      _sum: {
        views: true,
        likes: true,
        comments: true,
        shares: true,
        saves: true,
        danmakuCount: true,
      },
      _avg: { completionRate: true },
    })

    const rowsByAccount: Record<string, typeof dailyStats> = {}
    for (const stat of dailyStats) {
      if (!rowsByAccount[stat.accountId]) rowsByAccount[stat.accountId] = []
      rowsByAccount[stat.accountId].push(stat)
    }

    const dateKeys = Array.from(
      new Set(dailyStats.map((stat) => stat.date.toISOString().slice(0, 10))),
    ).sort()
    const dailyTrend = dateKeys.map((date) => {
      const rowsForDate = dailyStats.filter((stat) => stat.date.toISOString().slice(0, 10) === date)
      let followers = 0
      for (const account of accounts) {
        const rows = rowsByAccount[account.id] || []
        const latestAtOrBefore = [...rows]
          .reverse()
          .find((row) => row.date.toISOString().slice(0, 10) <= date)
        const firstKnown = rows[0]
        followers += latestAtOrBefore?.followers ?? firstKnown?.followers ?? account.followers ?? 0
      }

      return {
        date,
        followers,
        views: rowsForDate.reduce((sum, stat) => sum + (stat.viewsIncrement || stat.views || 0), 0),
        likes: rowsForDate.reduce((sum, stat) => sum + (stat.likesIncrement || stat.likes || 0), 0),
        comments: rowsForDate.reduce(
          (sum, stat) => sum + (stat.commentsIncrement || stat.comments || 0),
          0,
        ),
        shares: rowsForDate.reduce(
          (sum, stat) => sum + (stat.sharesIncrement || stat.shares || 0),
          0,
        ),
      }
    })

    const scopedOverview = {
      accounts: {
        total: accounts.length,
        active: accounts.length,
        byPlatform: accounts.reduce(
          (acc, account) => {
            acc[account.platform] = (acc[account.platform] || 0) + 1
            return acc
          },
          {} as Record<string, number>,
        ),
        totalFollowers: accounts.reduce((sum, account) => sum + (account.followers || 0), 0),
        totalLikes: accounts.reduce((sum, account) => sum + (account.likes || 0), 0),
      },
      posts: {
        total: totalPosts,
        published: publishedPosts,
        failed: failedPosts,
      },
      engagement: {
        totalViews: postStatsAgg._sum.views || 0,
        totalLikes: postStatsAgg._sum.likes || 0,
        totalComments: postStatsAgg._sum.comments || 0,
        totalShares: postStatsAgg._sum.shares || 0,
        totalSaves: postStatsAgg._sum.saves || 0,
        totalDanmaku: postStatsAgg._sum.danmakuCount || 0,
        avgCompletionRate: postStatsAgg._avg.completionRate || 0,
      },
    }

    return {
      period: { start, end },
      overview: scopedOverview,
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
        saves: p.stats?.saves || 0,
        publishedAt: p.updatedAt,
      })),
      dailyTrend,
    }
  }

  /**
   * 鏁版嵁鍚屾瘮鐜瘮瀵规瘮
   * 杩斿洖鏈懆vs涓婂懆銆佹湰鏈坴s涓婃湀銆佹湰鏈坴s鍘诲勾鍚屾湀鐨勬牳蹇冩寚鏍囧姣?
   */
  async getComparison(userId: string, groupId?: string) {
    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: { ...(groupId ? { groupId } : {}) },
      select: { id: true },
    })
    const accountIds = accounts.map((a) => a.id)

    const now = new Date()

    // 鏈懆锛堝懆涓€鍒颁粖澶╋級
    const thisWeekStart = this.getWeekStart(now)
    const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000)
    const lastWeekEnd = new Date(thisWeekStart.getTime() - 1)

    // 鏈湀
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonthEnd = new Date(thisMonthStart.getTime() - 1)

    // 鍘诲勾鍚屾湀
    const lastYearSameMonthStart = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    const lastYearSameMonthEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0)

    const [thisWeek, lastWeek, thisMonth, lastMonth, lastYearSameMonth] = await Promise.all([
      this.aggregateStats(accountIds, thisWeekStart, now),
      this.aggregateStats(accountIds, lastWeekStart, lastWeekEnd),
      this.aggregateStats(accountIds, thisMonthStart, now),
      this.aggregateStats(accountIds, lastMonthStart, lastMonthEnd),
      this.aggregateStats(accountIds, lastYearSameMonthStart, lastYearSameMonthEnd),
    ])

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
    }
  }

  /**
   * 鎾斁閲忔鍗?鈥?鎸夋挱鏀鹃噺鎺掑悕鐨勮棰戝垪琛?
   */
  async getViewsRanking(
    userId: string,
    params: {
      limit?: number
      period?: 'week' | 'month' | 'all'
      platform?: string
      groupId?: string
    },
  ) {
    const { limit = 50, period = 'all', platform, groupId } = params

    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: {
        ...(platform ? { platform: platform as Platform } : {}),
        ...(groupId ? { groupId } : {}),
      },
      select: { id: true },
    })
    const accountIds = accounts.map((a) => a.id)

    // 鏃堕棿鑼冨洿
    let dateFilter: Prisma.PostWhereInput = {}
    const now = new Date()
    if (period === 'week') {
      dateFilter = { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } }
    } else if (period === 'month') {
      dateFilter = { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }
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
    })

    return {
      ranking: posts.map((p, index) => {
        const pviews = p.stats?.views || 0
        const plikes = p.stats?.likes || 0
        return {
          rank: index + 1,
          postId: p.id,
          title: p.title,
          platform: p.account.platform,
          accountName: p.account.nickname,
          accountAvatar: p.account.avatar,
          views: pviews,
          likes: plikes,
          comments: p.stats?.comments || 0,
          shares: p.stats?.shares || 0,
          completionRate: p.stats?.completionRate || 0,
          avgPlayDuration: p.stats?.avgPlayDuration || 0,
          engagementRate: pviews > 0 ? Math.round((plikes / pviews) * 10000) / 100 : 0,
          publishedAt: p.updatedAt,
        }
      }),
      total: posts.length,
      period,
    }
  }

  /**
   * 鑱氬悎鎸囧畾鏃堕棿娈靛唴鐨勬牳蹇冩寚鏍?
   */
  private async aggregateStats(accountIds: string[], start: Date, end: Date) {
    if (accountIds.length === 0) {
      return { views: 0, likes: 0, comments: 0, shares: 0, followers: 0, posts: 0 }
    }

    const [dailyAgg, postCount] = await Promise.all([
      this.prisma.dailyStats.aggregate({
        where: {
          accountId: { in: accountIds },
          date: { gte: start, lte: end },
        },
        _sum: {
          viewsIncrement: true,
          likesIncrement: true,
          commentsIncrement: true,
          sharesIncrement: true,
          followersIncrement: true,
        },
      }),
      this.prisma.post.count({
        where: {
          accountId: { in: accountIds },
          status: 'PUBLISHED',
          updatedAt: { gte: start, lte: end },
        },
      }),
    ])

    // 绮変笣澧為暱 = 鏈熸湯 - 鏈熷垵
    const followerStats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accountIds },
        date: { gte: start, lte: end },
      },
      orderBy: [{ accountId: 'asc' }, { date: 'asc' }],
      select: { accountId: true, followers: true },
    })

    const firstFollowers: Record<string, number> = {}
    const lastFollowers: Record<string, number> = {}
    for (const stat of followerStats) {
      if (firstFollowers[stat.accountId] === undefined) {
        firstFollowers[stat.accountId] = stat.followers || 0
      }
      lastFollowers[stat.accountId] = stat.followers || 0
    }

    const followerGrowth = accountIds.reduce((sum, accountId) => {
      const first = firstFollowers[accountId] ?? 0
      const last = lastFollowers[accountId] ?? first
      return sum + Math.max(0, last - first)
    }, 0)

    return {
      views: dailyAgg._sum.viewsIncrement || 0,
      likes: dailyAgg._sum.likesIncrement || 0,
      comments: dailyAgg._sum.commentsIncrement || 0,
      shares: dailyAgg._sum.sharesIncrement || 0,
      followers: dailyAgg._sum.followersIncrement || 0,
      posts: postCount,
    }
  }

  /**
   * 璁＄畻鍙樺寲鐜?
   */
  private calcChange(current: Record<string, number>, previous: Record<string, number>) {
    const result: Record<string, number | null> = {}
    for (const key of Object.keys(current)) {
      const cur = current[key] || 0
      const prev = previous[key] || 0
      if (prev === 0) {
        result[key] = null // 上周无数据时不显示增长率
      } else {
        result[key] = Math.round(((cur - prev) / prev) * 100)
      }
    }
    return result
  }

  /**
   * 鑾峰彇鏈懆涓€鐨勬棩鏈燂紙UTC+8 涓浗鏃跺尯锛?
   */
  private getWeekStart(date: Date): Date {
    // 杞崲涓?UTC+8
    const utc8Offset = 8 * 60 * 60 * 1000
    const localTime = new Date(date.getTime() + utc8Offset)
    const day = localTime.getUTCDay()
    const diff = localTime.getUTCDate() - day + (day === 0 ? -6 : 1)
    localTime.setUTCDate(diff)
    localTime.setUTCHours(0, 0, 0, 0)
    // 杞洖 UTC
    return new Date(localTime.getTime() - utc8Offset)
  }

  // ─── 以下为补全的 7 个缺失服务方法 ───

  async getLikesTrend(userId: string, days: number = 7, platform?: string) {
    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: { ...(platform ? { platform: platform as Platform } : {}) },
      select: { id: true },
    })
    const accountIds = accounts.map((a) => a.id)
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const stats = await this.prisma.dailyStats.findMany({
      where: { accountId: { in: accountIds }, date: { gte: startDate } },
      orderBy: { date: 'asc' },
      select: { date: true, likes: true },
    })

    const byDate: Record<string, number> = {}
    for (const s of stats) {
      const d = s.date.toISOString().slice(0, 10)
      byDate[d] = (byDate[d] || 0) + s.likes
    }

    const result: { date: string; value: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      result.push({ date: key, value: byDate[key] || 0 })
    }
    return result
  }

  async getPublishEffect(userId: string, days?: number, contentId?: string, groupId?: string) {
    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: { ...(groupId ? { groupId } : {}) },
      select: { id: true },
    })
    const accountIds = accounts.map((a) => a.id)

    const where: any = { accountId: { in: accountIds } }
    if (contentId) where.id = contentId
    if (days) {
      where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) }
    }

    const posts = await this.prisma.post.findMany({
      where,
      include: {
        stats: true,
        account: { select: { nickname: true, platform: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return posts.map((p) => ({
      id: p.id,
      title: p.title,
      platform: p.account.platform,
      accountName: p.account.nickname,
      status: p.status,
      views: p.stats?.views || 0,
      likes: p.stats?.likes || 0,
      comments: p.stats?.comments || 0,
      shares: p.stats?.shares || 0,
      saves: p.stats?.saves || 0,
      completionRate: p.stats?.completionRate || 0,
      avgPlayDuration: p.stats?.avgPlayDuration || 0,
      danmakuCount: p.stats?.danmakuCount || 0,
      followsFromPost: p.stats?.followsFromPost || 0,
      publishedAt: p.publishAt || p.createdAt,
    }))
  }

  async getEngagementRate(userId: string, days: number = 7, platform?: string, groupId?: string) {
    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: {
        ...(platform ? { platform: platform as Platform } : {}),
        ...(groupId ? { groupId } : {}),
      },
      select: { id: true },
    })
    const accountIds = accounts.map((a) => a.id)
    const safeDays = Math.max(1, Number(days) || 7)
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (safeDays - 1))
    startDate.setHours(0, 0, 0, 0)

    const stats = await this.prisma.dailyStats.findMany({
      where: { accountId: { in: accountIds }, date: { gte: startDate } },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        views: true,
        likes: true,
        comments: true,
        shares: true,
        viewsIncrement: true,
        likesIncrement: true,
        commentsIncrement: true,
        sharesIncrement: true,
      },
    })

    const byDate: Record<string, { views: number; interactions: number }> = {}
    for (const s of stats) {
      const d = s.date.toISOString().slice(0, 10)
      if (!byDate[d]) byDate[d] = { views: 0, interactions: 0 }
      const views = s.viewsIncrement || s.views || 0
      const interactions =
        (s.likesIncrement || s.likes || 0) +
        (s.commentsIncrement || s.comments || 0) +
        (s.sharesIncrement || s.shares || 0)
      byDate[d].views += views
      byDate[d].interactions += interactions
    }

    return Array.from({ length: safeDays }, (_, index) => {
      const date = new Date()
      date.setDate(date.getDate() - (safeDays - 1 - index))
      const key = date.toISOString().slice(0, 10)
      const data = byDate[key] || { views: 0, interactions: 0 }
      return {
        date: key,
        value: data.views > 0 ? Math.round((data.interactions / data.views) * 10000) / 100 : 0,
      }
    })
  }

  async exportReport(
    userId: string,
    startDate?: string,
    endDate?: string,
    format: string = 'json',
  ) {
    const report = await this.generateReport(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    })

    if (format === 'csv') {
      const headers = 'date,platform,account,views,likes,comments,shares,followers'
      const rows = (report.dailyTrend || []).map(
        (d: any) =>
          `${d.date},${d.account?.platform || ''},${d.account?.nickname || ''},${d.views || 0},${d.likes || 0},${d.comments || 0},${d.shares || 0},${d.followers || 0}`,
      )
      return [headers, ...rows].join('\n')
    }
    return report
  }

  async getMonetization(userId: string, days: number = 30, platform?: string) {
    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: { ...(platform ? { platform: platform as Platform } : {}) },
      select: { id: true, platform: true },
    })
    const accountIds = accounts.map((a) => a.id)
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const stats = await this.prisma.dailyStats.findMany({
      where: { accountId: { in: accountIds }, date: { gte: startDate } },
      orderBy: { date: 'asc' },
      include: { account: { select: { platform: true } } },
    })

    const totals = { revenue: 0, gmv: 0, orders: 0, commission: 0, buyerCount: 0, avgOrderValue: 0 }
    let avgCount = 0
    const byPlatform: Record<string, any> = {}
    const dailyTrendByDate: Record<
      string,
      {
        date: string
        revenue: number
        gmv: number
        orders: number
        commission: number
        buyerCount: number
        avgOrderValue: number
        avgOrderValueCount: number
      }
    > = {}

    for (const s of stats) {
      totals.revenue += s.revenue
      totals.gmv += s.gmv
      totals.orders += s.orders
      totals.commission += s.commission
      totals.buyerCount += s.buyerCount
      if (s.avgOrderValue > 0) {
        totals.avgOrderValue += s.avgOrderValue
        avgCount++
      }

      const p = s.account.platform
      if (!byPlatform[p]) {
        byPlatform[p] = {
          platform: p,
          revenue: 0,
          gmv: 0,
          orders: 0,
          commission: 0,
          buyerCount: 0,
          avgOrderValue: 0,
        }
      }
      byPlatform[p].revenue += s.revenue
      byPlatform[p].gmv += s.gmv
      byPlatform[p].orders += s.orders
      byPlatform[p].commission += s.commission
      byPlatform[p].buyerCount += s.buyerCount
      if (s.avgOrderValue > 0) {
        byPlatform[p].avgOrderValue = Math.round(
          (byPlatform[p].avgOrderValue + s.avgOrderValue) / 2,
        )
      }

      const date = s.date.toISOString().slice(0, 10)
      if (!dailyTrendByDate[date]) {
        dailyTrendByDate[date] = {
          date,
          revenue: 0,
          gmv: 0,
          orders: 0,
          commission: 0,
          buyerCount: 0,
          avgOrderValue: 0,
          avgOrderValueCount: 0,
        }
      }
      dailyTrendByDate[date].revenue += s.revenue
      dailyTrendByDate[date].gmv += s.gmv
      dailyTrendByDate[date].orders += s.orders
      dailyTrendByDate[date].commission += s.commission
      dailyTrendByDate[date].buyerCount += s.buyerCount
      if (s.avgOrderValue > 0) {
        dailyTrendByDate[date].avgOrderValue += s.avgOrderValue
        dailyTrendByDate[date].avgOrderValueCount += 1
      }
    }

    if (avgCount > 0) totals.avgOrderValue = Math.round(totals.avgOrderValue / avgCount)
    const dailyTrend = Object.values(dailyTrendByDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ avgOrderValueCount, ...row }) => ({
        ...row,
        avgOrderValue:
          avgOrderValueCount > 0 ? Math.round(row.avgOrderValue / avgOrderValueCount) : 0,
      }))

    return {
      totalRevenue: totals.revenue,
      totalGmv: totals.gmv,
      totalOrders: totals.orders,
      totalCommission: totals.commission,
      totalBuyerCount: totals.buyerCount,
      totalAvgOrderValue: totals.avgOrderValue,
      byPlatform: Object.values(byPlatform),
      dailyTrend,
    }
  }

  async getAccountAnalytics(accountId: string) {
    const [posts, statsAgg, postCount] = await Promise.all([
      this.prisma.post.findMany({
        where: { accountId },
        include: { stats: true },
      }),
      this.prisma.postStats.aggregate({
        where: { post: { accountId } },
        _sum: {
          views: true,
          likes: true,
          comments: true,
          shares: true,
          saves: true,
          danmakuCount: true,
          followsFromPost: true,
        },
        _avg: { completionRate: true },
      }),
      this.prisma.post.count({ where: { accountId } }),
    ])

    const totalInteractions =
      (statsAgg._sum.likes || 0) + (statsAgg._sum.comments || 0) + (statsAgg._sum.shares || 0)
    const totalViews = statsAgg._sum.views || 0
    const avgEngagementRate =
      totalViews > 0 ? Math.round((totalInteractions / totalViews) * 10000) / 100 : 0

    return {
      totalViews,
      totalLikes: statsAgg._sum.likes || 0,
      totalComments: statsAgg._sum.comments || 0,
      totalShares: statsAgg._sum.shares || 0,
      totalSaves: statsAgg._sum.saves || 0,
      totalDanmaku: statsAgg._sum.danmakuCount || 0,
      totalFollowsFromPost: statsAgg._sum.followsFromPost || 0,
      avgCompletionRate: statsAgg._avg.completionRate
        ? Math.round(statsAgg._avg.completionRate * 100) / 100
        : 0,
      totalPosts: postCount,
      avgEngagementRate,
    }
  }

  async getAccountPosts(
    accountId: string,
    params: { page: number; pageSize: number; sortBy: string; sortOrder: 'asc' | 'desc' },
  ) {
    const { page, pageSize, sortBy, sortOrder } = params
    const skip = (page - 1) * pageSize

    const where = { accountId }
    const orderBy: any = {}
    const statsFields = [
      'views',
      'likes',
      'comments',
      'shares',
      'saves',
      'completionRate',
      'followsFromPost',
      'danmakuCount',
    ]
    if (statsFields.includes(sortBy)) {
      orderBy.stats = { [sortBy]: sortOrder }
    } else {
      orderBy[sortBy] = sortOrder
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: { stats: true, account: { select: { platform: true } } },
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.post.count({ where }),
    ])

    const items = posts.map((p) => {
      const views = p.stats?.views || 0
      const likes = p.stats?.likes || 0
      const comments = p.stats?.comments || 0
      const shares = p.stats?.shares || 0
      const engagementRate =
        views > 0 ? Math.round(((likes + comments + shares) / views) * 10000) / 100 : 0

      return {
        id: p.id,
        title: p.title,
        platform: p.account.platform,
        status: p.status,
        publishAt: p.publishAt?.toISOString() || null,
        createdAt: p.createdAt.toISOString(),
        views,
        likes,
        comments,
        shares,
        saves: p.stats?.saves || 0,
        completionRate: p.stats?.completionRate || 0,
        avgPlayDuration: p.stats?.avgPlayDuration || 0,
        danmakuCount: p.stats?.danmakuCount || 0,
        followsFromPost: p.stats?.followsFromPost || 0,
        engagementRate,
        tags: (p.title || '').match(/#[\u4e00-\u9fa5\w]+/g)?.map((t: string) => t.slice(1)) || [],
      }
    })

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  }

  /** 从 Post.tags JSON 字段提取标签频次统计 */
  async getTags(groupId?: string) {
    let accountIds: string[] | undefined
    if (groupId) {
      const accounts = await this.prisma.account.findMany({
        where: { groupId },
        select: { id: true },
      })
      accountIds = accounts.map((a) => a.id)
    }
    const posts = await this.prisma.post.findMany({
      select: { tags: true, title: true },
      where: {
        ...(accountIds ? { accountId: { in: accountIds } } : {}),
        OR: [{ tags: { not: '' } }, { title: { not: '' } }],
      },
      take: 5000,
    })
    const tagCount: Record<string, number> = {}
    for (const p of posts) {
      let tagList: string[] = []
      // 优先从 tags JSON 字段读取
      if (p.tags) {
        try {
          const parsed = JSON.parse(p.tags)
          tagList = Array.isArray(parsed) ? parsed.map((t: any) => String(t)) : []
        } catch {
          // JSON 解析失败，回退到 title 正则提取
        }
      }
      // 回退：从标题提取 #标签
      if (tagList.length === 0) {
        const matches = (p.title || '').match(/#[\u4e00-\u9fa5\w]+/g)
        if (matches) tagList = matches.map((t) => t.slice(1))
      }
      for (const tag of tagList) {
        const t = tag.trim()
        if (t.length >= 2) tagCount[t] = (tagCount[t] || 0) + 1
      }
    }
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([name, count]) => ({ name, count }))
  }

  /**
   * 获取所有账号的日/周/月维度数据明细列表
   * 设计参考：聚合 DailyStats 增量字段
   * day = 昨日的增量
   * week = 最近7天增量之和
   * month = 最近30天增量之和
   */
  async getAccountDetailList(userId: string, platform?: string, groupId?: string) {
    // shared mode: 不按 userId 过滤
    const accounts = await this.prisma.account.findMany({
      where: {
        ...(platform ? { platform: platform as Platform } : {}),
        ...(groupId ? { groupId } : {}),
      },
      select: { id: true, platform: true, nickname: true, avatar: true, followers: true },
      orderBy: { createdAt: 'desc' },
    })

    const accountIds = accounts.map((a) => a.id)

    // 查询最近30天的 DailyStats
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    sevenDaysAgo.setHours(0, 0, 0, 0)

    const allStats = await this.prisma.dailyStats.findMany({
      where: {
        accountId: { in: accountIds },
        date: { gte: thirtyDaysAgo },
      },
      select: {
        accountId: true,
        date: true,
        followers: true,
        viewsIncrement: true,
        likesIncrement: true,
        commentsIncrement: true,
        sharesIncrement: true,
        followersIncrement: true,
      },
      orderBy: { date: 'asc' },
    })

    // 按 accountId 分组
    const statsByAccount: Record<string, typeof allStats> = {}
    for (const s of allStats) {
      if (!statsByAccount[s.accountId]) statsByAccount[s.accountId] = []
      statsByAccount[s.accountId].push(s)
    }

    // 计算每个账号的日/周/月聚合
    const isWithinLast7 = (d: Date) => d >= sevenDaysAgo
    const isYesterday = (d: Date) => {
      const ds = d.toISOString().slice(0, 10)
      const ys = yesterday.toISOString().slice(0, 10)
      return ds === ys
    }

    return accounts.map((acc) => {
      const stats = statsByAccount[acc.id] || []

      const monthTotal = { play: 0, like: 0, comment: 0, share: 0, new_fans: 0 }
      const weekTotal = { play: 0, like: 0, comment: 0, share: 0, new_fans: 0 }
      const dayTotal = { play: 0, like: 0, comment: 0, share: 0, new_fans: 0 }
      let lastFans = acc.followers || 0

      for (const s of stats) {
        const increments = {
          play: s.viewsIncrement || 0,
          like: s.likesIncrement || 0,
          comment: s.commentsIncrement || 0,
          share: s.sharesIncrement || 0,
          new_fans: s.followersIncrement || 0,
        }

        // 月累计：全部30天
        monthTotal.play += increments.play
        monthTotal.like += increments.like
        monthTotal.comment += increments.comment
        monthTotal.share += increments.share
        monthTotal.new_fans += increments.new_fans

        // 周累计：最近7天
        if (isWithinLast7(s.date)) {
          weekTotal.play += increments.play
          weekTotal.like += increments.like
          weekTotal.comment += increments.comment
          weekTotal.share += increments.share
          weekTotal.new_fans += increments.new_fans
        }

        // 日：昨天
        if (isYesterday(s.date)) {
          dayTotal.play += increments.play
          dayTotal.like += increments.like
          dayTotal.comment += increments.comment
          dayTotal.share += increments.share
          dayTotal.new_fans += increments.new_fans
        }

        // 取最新的粉丝快照
        if (s.followers > 0) lastFans = s.followers
      }

      return {
        id: acc.id,
        nickname: acc.nickname,
        avatar: acc.avatar,
        platform: acc.platform,
        fans: lastFans,
        info: { day_total: dayTotal, week_total: weekTotal, month_total: monthTotal },
      }
    })
  }
}
