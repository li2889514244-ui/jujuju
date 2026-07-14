/**
 * 平台管理服务核心
 * 整合OAuth、数据采集、Token管理
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { OAuthService } from './oauth/oauth.service'
import { PLATFORM_CONFIGS } from './config/platform-config'
import { ReportMetricsDto, ReportPostStatsDto } from './dto/platform.dto'
import { IDataCollector } from './collectors/data-collector.interface'
import { DouyinCollector } from './collectors/douyin.collector'
import { KuaishouCollector } from './collectors/kuaishou.collector'
import { XiaohongshuCollector } from './collectors/xiaohongshu.collector'
import { ShipinhaoCollector } from './collectors/shipinhao.collector'
import { BilibiliCollector } from './collectors/bilibili.collector'
import { WeiboCollector } from './collectors/weibo.collector'

@Injectable()
export class PlatformsService {
  private readonly logger = new Logger(PlatformsService.name)
  private readonly collectors: Map<string, IDataCollector>
  private readonly beijingOffsetMs = 8 * 60 * 60 * 1000

  constructor(
    private prisma: PrismaService,
    private oauthService: OAuthService,
    douyinCollector: DouyinCollector,
    kuaishouCollector: KuaishouCollector,
    xiaohongshuCollector: XiaohongshuCollector,
    shipinhaoCollector: ShipinhaoCollector,
    bilibiliCollector: BilibiliCollector,
    weiboCollector: WeiboCollector,
  ) {
    this.collectors = new Map<string, IDataCollector>([
      ['DOUYIN', douyinCollector],
      ['KUAISHOU', kuaishouCollector],
      ['XIAOHONGSHU', xiaohongshuCollector],
      ['WECHAT_VIDEO', shipinhaoCollector],
      ['BILIBILI', bilibiliCollector],
      ['WEIBO', weiboCollector],
    ])
  }

  private getBeijingDayStart(offsetDays = 0): Date {
    const beijingNow = new Date(Date.now() + this.beijingOffsetMs)
    return new Date(
      Date.UTC(
        beijingNow.getUTCFullYear(),
        beijingNow.getUTCMonth(),
        beijingNow.getUTCDate() + offsetDays,
      ) - this.beijingOffsetMs,
    )
  }

  private getBeijingDayStartFromDate(value: string): Date {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, year, month, day] = match
      return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)) - this.beijingOffsetMs)
    }
    const date = new Date(value)
    const beijingDate = new Date(date.getTime() + this.beijingOffsetMs)
    return new Date(
      Date.UTC(beijingDate.getUTCFullYear(), beijingDate.getUTCMonth(), beijingDate.getUTCDate()) -
        this.beijingOffsetMs,
    )
  }

  // ==================== 平台信息 ====================

  /**
   * 获取所有支持的平台列表
   */
  getSupportedPlatforms() {
    return Object.entries(PLATFORM_CONFIGS).map(([key, config]) => ({
      key,
      name: config.name,
      oauthUrl: config.oauth.authorizeUrl,
      scopes: config.oauth.scopes,
    }))
  }

  /**
   * 获取平台配置信息
   */
  getPlatformInfo(platform: string) {
    const config = PLATFORM_CONFIGS[platform]
    if (!config) {
      throw new NotFoundException(`不支持的平台: ${platform}`)
    }
    return {
      key: platform,
      name: config.name,
      scopes: config.oauth.scopes,
      rateLimit: config.api.rateLimit,
    }
  }

  // ==================== OAuth授权 ====================

  /**
   * 获取OAuth授权URL
   */
  async getAuthorizeUrl(platform: string, userId: string, teamId?: string): Promise<string> {
    if (!PLATFORM_CONFIGS[platform]) {
      throw new BadRequestException(`不支持的平台: ${platform}`)
    }
    return this.oauthService.buildAuthorizeUrl(platform, userId, teamId)
  }

  /**
   * 解除平台授权
   */
  async revokeAuthorization(accountId: string, userId: string): Promise<void> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    })

    if (!account) {
      throw new NotFoundException('账号不存在')
    }

    // 权限检查
    if (account.userId !== userId) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } })
      if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
        throw new BadRequestException('无权操作此账号')
      }
    }

    // 清除OAuth Token
    const metadata = (account.metadata || '{}') as unknown as Record<string, any>
    const { oauthToken, tokenExpiresAt, scope, ...restMetadata } = metadata || {}

    await this.prisma.account.update({
      where: { id: accountId },
      data: {
        metadata: restMetadata,
        status: 'DISABLED',
      },
    })

    this.logger.log(`平台授权已解除: ${account.platform} - ${account.nickname}`)
  }

  // ==================== 数据采集 ====================

  /**
   * 获取指定平台的采集器
   */
  private getCollector(platform: string): IDataCollector {
    const collector = this.collectors.get(platform)
    if (!collector) {
      throw new BadRequestException(`不支持的平台数据采集: ${platform}`)
    }
    return collector
  }

  /**
   * 采集单个账号数据
   */
  async collectAccountData(accountId: string, type: 'account' | 'content' | 'daily' = 'daily') {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    })

    if (!account) {
      throw new NotFoundException('账号不存在')
    }

    const collector = this.getCollector(account.platform)

    switch (type) {
      case 'account':
        return collector.collectAccountMetrics(accountId)
      case 'content':
        return collector.collectContentMetrics(accountId)
      case 'daily':
        return collector.collectDailyMetrics(accountId)
    }
  }

  /**
   * 批量采集数据
   */
  async batchCollectData(accountIds: string[], type: 'account' | 'content' | 'daily' = 'daily') {
    const results: Array<{
      accountId: string
      success: boolean
      error?: string
    }> = []

    for (const accountId of accountIds) {
      try {
        const result = await this.collectAccountData(accountId, type)
        results.push({
          accountId,
          success: result.success,
          error: result.error,
        })
      } catch (error: any) {
        results.push({
          accountId,
          success: false,
          error: error.message,
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    this.logger.log(`批量采集完成: ${successCount}/${accountIds.length} 成功`)

    return {
      total: accountIds.length,
      success: successCount,
      failed: accountIds.length - successCount,
      results,
    }
  }

  // ==================== 伴侣数据上报 ====================

  /**
   * 接收桌面伴侣上报的账号指标，写入 DailyStats 并更新 Account
   */
  async reportMetrics(dto: ReportMetricsDto) {
    const { accountId, metrics, date } = dto
    const account = await this.prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      this.logger.warn(`reportMetrics: account ${accountId} not found`)
      return { success: false, error: 'Account not found' }
    }

    const hasReportedIncrement = [
      metrics.newFollowers,
      metrics.newViews,
      metrics.newLikes,
      metrics.newComments,
      metrics.newShares,
    ].some((value) => typeof value === 'number' && Number.isFinite(value))

    const targetDate = date
      ? this.getBeijingDayStartFromDate(date)
      : this.getBeijingDayStart(hasReportedIncrement ? -1 : 0)
    const platform = account.platform as any

    try {
      const pickNumber = (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) ? value : undefined
      const parseJsonObject = (value: unknown): Record<string, any> => {
        if (!value) return {}
        if (typeof value === 'object') return value as Record<string, any>
        if (typeof value !== 'string') return {}
        try {
          const parsed = JSON.parse(value)
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
        } catch {
          return {}
        }
      }
      const normalizeDailyMetric = (value: any) => {
        const normalized = {
          play: pickNumber(value?.play) ?? 0,
          like: pickNumber(value?.like) ?? 0,
          comment: pickNumber(value?.comment) ?? 0,
          share: pickNumber(value?.share) ?? 0,
          new_fans: pickNumber(value?.new_fans) ?? 0,
        }
        return Object.values(normalized).some((n) => n > 0) ? normalized : undefined
      }
      const normalizeVideoPeriodMetrics = (value: any) => {
        if (!value || typeof value !== 'object') return undefined
        const normalized: Record<string, any> = {}
        for (const key of ['day_total', 'week_total', 'month_total']) {
          const total = normalizeDailyMetric(value[key])
          if (total) normalized[key] = total
        }
        const metricKeys = ['play', 'like', 'comment', 'share', 'new_fans']
        const sameMetrics = (a: any, b: any) =>
          Boolean(a && b) && metricKeys.every((key) => (a[key] || 0) === (b[key] || 0))
        const isCumulativeAtLeast = (a: any, b: any) =>
          Boolean(a && b) && metricKeys.every((key) => (a[key] || 0) >= (b[key] || 0))
        if (
          normalized.day_total &&
          normalized.week_total &&
          !isCumulativeAtLeast(normalized.week_total, normalized.day_total)
        ) {
          delete normalized.week_total
        }
        const monthBaseline = normalized.week_total || normalized.day_total
        if (
          normalized.month_total &&
          monthBaseline &&
          !isCumulativeAtLeast(normalized.month_total, monthBaseline)
        ) {
          delete normalized.month_total
        }
        if (
          sameMetrics(normalized.day_total, normalized.week_total) &&
          sameMetrics(normalized.week_total, normalized.month_total)
        ) {
          delete normalized.week_total
          delete normalized.month_total
        }
        if (typeof value.source === 'string') normalized.source = value.source
        if (typeof value.trustedDailyIncrements === 'boolean')
          normalized.trustedDailyIncrements = value.trustedDailyIncrements
        if (typeof value.collectedAt === 'string') normalized.collectedAt = value.collectedAt
        return normalized.day_total || normalized.week_total || normalized.month_total
          ? normalized
          : undefined
      }

      // Upsert DailyStats for the target date (including monetization + store fields)
      const statData: Record<string, number | undefined> = {
        followers: pickNumber(metrics.followers),
        views: pickNumber(metrics.views),
        likes: pickNumber(metrics.likes),
        comments: pickNumber(metrics.comments),
        shares: pickNumber(metrics.shares),
        revenue: pickNumber(metrics.revenue),
        gmv: pickNumber(metrics.gmv),
        orders: pickNumber(metrics.orders),
        commission: pickNumber(metrics.commission),
        buyerCount: pickNumber(metrics.buyerCount),
        productCount: pickNumber(metrics.productCount),
        avgOrderValue: pickNumber(metrics.avgOrderValue),
        // 伴侣已采集的增量字段，直接映射
        followersIncrement: pickNumber(metrics.newFollowers),
        viewsIncrement: pickNumber(metrics.newViews),
        likesIncrement: pickNumber(metrics.newLikes),
        commentsIncrement: pickNumber(metrics.newComments),
        sharesIncrement: pickNumber(metrics.newShares),
        unfollows: pickNumber(metrics.unfollows),
      }

      // 对每个增量字段独立补算：伴侣可能只上报了部分新增字段。
      // 只有当前/前次总量口径可信时才用差值，避免把累计总数误当日增量。
      const previousStats = await this.prisma.dailyStats.findFirst({
        where: { accountId, date: { lt: targetDate } },
        select: { followers: true, views: true, likes: true, comments: true, shares: true },
        orderBy: { date: 'desc' },
      })
      if (previousStats) {
        const fillIncrement = (
          incrementKey:
            | 'followersIncrement'
            | 'viewsIncrement'
            | 'likesIncrement'
            | 'commentsIncrement'
            | 'sharesIncrement',
          totalKey: 'followers' | 'views' | 'likes' | 'comments' | 'shares',
        ) => {
          const current = statData[totalKey]
          const previous = previousStats[totalKey] ?? 0
          if (current === undefined || current === null) return
          const delta = Math.max(0, current - previous)
          const reportedIncrement = statData[incrementKey]
          const missingIncrement =
            reportedIncrement === undefined ||
            (reportedIncrement === 0 && delta > 0 && current > previous)
          if (!missingIncrement) return

          if (previous <= 0 && current > 0) {
            this.logger.debug(
              `reportMetrics: skip ${incrementKey} delta for ${accountId}; no trusted baseline`,
            )
            return
          }
          if (delta > 10000 && current > previous * 3) {
            this.logger.debug(
              `reportMetrics: skip ${incrementKey} delta for ${accountId}; metric source jump ${previous}->${current}`,
            )
            return
          }

          statData[incrementKey] = delta
        }

        fillIncrement('followersIncrement', 'followers')
        fillIncrement('viewsIncrement', 'views')
        fillIncrement('likesIncrement', 'likes')
        fillIncrement('commentsIncrement', 'comments')
        fillIncrement('sharesIncrement', 'shares')
      } else {
        this.logger.debug(
          `reportMetrics: no previous stats for ${accountId}, missing increments stay empty (first collection)`,
        )
      }

      // ── 总量跳变保护 ──
      // 如果当前总量比前次跳变超过10倍，说明数据源口径可能变了，
      // 跳过该总量字段的更新，保留前次可靠值。
      if (previousStats) {
        const totalFields: Array<{
          key: 'views' | 'likes' | 'comments' | 'shares'
          prev: number
        }> = [
          { key: 'views', prev: previousStats.views ?? 0 },
          { key: 'likes', prev: previousStats.likes ?? 0 },
          { key: 'comments', prev: previousStats.comments ?? 0 },
          { key: 'shares', prev: previousStats.shares ?? 0 },
        ]
        for (const { key, prev } of totalFields) {
          const curr = statData[key]
          if (curr === undefined || curr === null) continue
          if (prev > 0 && curr > prev * 10) {
            this.logger.warn(
              `reportMetrics: skip ${key} update for ${accountId}; jump ${prev}->${curr} (>10x), likely data source change`,
            )
            delete statData[key]
          }
        }
      }

      // ── 重复数据检测 ──
      // 如果本次上报的所有字段与前次记录完全相同，跳过 upsert（避免6-16数据在7-04被复制）
      if (previousStats) {
        const allSame = [
          'followers',
          'views',
          'likes',
          'comments',
          'shares',
          'followersIncrement',
          'viewsIncrement',
          'likesIncrement',
          'commentsIncrement',
          'sharesIncrement',
        ].every((k) => {
          const curr = (statData as any)[k]
          const prev = (previousStats as any)[k] ?? 0
          // 只比较双方都有值的字段
          if (curr === undefined) return true
          return curr === prev
        })
        if (allSame && Object.values(statData).some((v) => v !== undefined && v !== 0)) {
          this.logger.debug(
            `reportMetrics: skip duplicate data for ${accountId} on ${targetDate.toISOString()}; identical to previous record`,
          )
          return { success: true, skipped: 'duplicate' }
        }
      }

      const statUpdateData = Object.fromEntries(
        Object.entries(statData).filter(([, value]) => value !== undefined),
      )
      const statCreateData = Object.fromEntries(
        Object.entries(statData).map(([key, value]) => [key, value ?? 0]),
      )
      await this.prisma.dailyStats.upsert({
        where: { accountId_date: { accountId, date: targetDate } },
        update: statUpdateData,
        create: { accountId, platform, date: targetDate, ...statCreateData },
      })

      // ── 视频号累计总量计算 ──
      // 采集端现在通过 post_list API 获取每个视频的累计数据并求和，
      // 提供了真实的累计总量（views/likes/comments/shares）。
      // 只有当采集端未提供累计值时，才从历史增量求和作为降级方案。
      if (platform === 'WECHAT_VIDEO' && metrics) {
        const hasCumulative =
          pickNumber(metrics.views) > 0 ||
          pickNumber(metrics.likes) > 0 ||
          pickNumber(metrics.comments) > 0 ||
          pickNumber(metrics.shares) > 0
        if (!hasCumulative) {
          this.logger.debug(
            `reportMetrics: WECHAT_VIDEO ${accountId} no cumulative from collector, computing from increments`,
          )
          const allStats = await this.prisma.dailyStats.findMany({
            where: { accountId, date: { lte: targetDate } },
            select: {
              viewsIncrement: true,
              likesIncrement: true,
              commentsIncrement: true,
              sharesIncrement: true,
            },
            orderBy: { date: 'asc' },
          })
          const cumulative = allStats.reduce(
            (acc, s) => ({
              views: acc.views + (s.viewsIncrement || 0),
              likes: acc.likes + (s.likesIncrement || 0),
              comments: acc.comments + (s.commentsIncrement || 0),
              shares: acc.shares + (s.sharesIncrement || 0),
            }),
            { views: 0, likes: 0, comments: 0, shares: 0 },
          )
          await this.prisma.dailyStats.update({
            where: { accountId_date: { accountId, date: targetDate } },
            data: {
              views: cumulative.views,
              likes: cumulative.likes,
              comments: cumulative.comments,
              shares: cumulative.shares,
            },
          })
          this.logger.debug(
            `reportMetrics: WECHAT_VIDEO ${accountId} cumulative from increments: views=${cumulative.views} likes=${cumulative.likes} comments=${cumulative.comments} shares=${cumulative.shares}`,
          )
        } else {
          this.logger.debug(
            `reportMetrics: WECHAT_VIDEO ${accountId} using collector cumulative: views=${pickNumber(metrics.views)} likes=${pickNumber(metrics.likes)} comments=${pickNumber(metrics.comments)} shares=${pickNumber(metrics.shares)}`,
          )
        }
      }

      // Update Account fields
      const accountUpdates: any = {}
      if (metrics.followers && metrics.followers > 0) accountUpdates.followers = metrics.followers
      if (metrics.likes && metrics.likes > 0) accountUpdates.likes = metrics.likes
      if (metrics.following !== undefined) accountUpdates.following = metrics.following
      const nickname = metrics._nickname
      if (nickname && typeof nickname === 'string' && nickname.length >= 2)
        accountUpdates.nickname = nickname
      const avatar = metrics._avatar
      if (avatar && typeof avatar === 'string') accountUpdates.avatar = avatar
      if (metrics.storeScore !== undefined) accountUpdates.storeScore = metrics.storeScore
      if (metrics.storeDiagnosis !== undefined)
        accountUpdates.storeDiagnosis = metrics.storeDiagnosis
      const videoPeriodMetrics = normalizeVideoPeriodMetrics(metrics?._periodMetrics?.videoData)
      if (videoPeriodMetrics) {
        const metadata = parseJsonObject(account.metadata)
        const periodMetrics = parseJsonObject(metadata.periodMetrics)
        accountUpdates.metadata = JSON.stringify({
          ...metadata,
          periodMetrics: {
            ...periodMetrics,
            videoData: videoPeriodMetrics,
          },
          companionPeriodMetricsUpdatedAt: new Date().toISOString(),
        })
      }

      if (Object.keys(accountUpdates).length > 0) {
        await this.prisma.account.update({
          where: { id: accountId },
          data: accountUpdates,
        })
      }

      this.logger.log(
        `reportMetrics: ${accountId} followers=${metrics.followers} views=${metrics.views} revenue=${metrics.revenue}`,
      )
      return { success: true }
    } catch (e: any) {
      this.logger.error(`reportMetrics error: ${e.message}`)
      return { success: false, error: e.message }
    }
  }

  /**
   * 接收桌面伴侣上报的视频/帖子数据，写入 Post + PostStats
   */
  private parseReportedPostDate(value: unknown): Date | undefined {
    // 1. Unix timestamp (number) — 抖音 create_time 是秒级
    if (typeof value === 'number') {
      // 秒级 (10位, ~2001–2286) vs 毫秒级 (13位)
      const seconds = value > 1e12 ? value / 1000 : value
      const d = new Date(seconds * 1000)
      if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) return d
      return undefined
    }

    // 2. 纯数字字符串 "1749171600"
    if (typeof value === 'string' && /^\d{9,13}$/.test(value.trim())) {
      const num = Number(value.trim())
      const seconds = num > 1e12 ? num / 1000 : num
      const d = new Date(seconds * 1000)
      if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000) return d
      return undefined
    }

    // 3. 字符串日期
    if (typeof value !== 'string' || !value.trim()) return undefined
    const raw = value.trim()
    const direct = new Date(raw)
    if (!Number.isNaN(direct.getTime())) return direct

    // 4. 中文日期 "2024年06月08日"
    const match = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
    if (!match) return undefined

    const [, year, month, day] = match
    const parsed = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  async reportPostStats(dto: ReportPostStatsDto) {
    const { accountId, posts } = dto
    const account = await this.prisma.account.findUnique({ where: { id: accountId } })
    if (!account) {
      this.logger.warn(`reportPostStats: account ${accountId} not found`)
      return { success: false, error: 'Account not found' }
    }

    let created = 0
    let updated = 0

    for (const p of posts) {
      try {
        const title = p.title || ''
        const publishAt = this.parseReportedPostDate(p.publishedAt || p.date)
        // Use title as a unique-ish key for the post within this account
        const postId = `${accountId}_${title.substring(0, 40)}`

        // Find existing post by title match
        const existing = await this.prisma.post.findFirst({
          where: { accountId, title },
        })

        let post
        if (existing) {
          post = existing
          const postUpdates: any = {}
          if (p.coverUrl) postUpdates.coverUrl = p.coverUrl
          if (publishAt && !existing.publishAt) postUpdates.publishAt = publishAt
          if (Object.keys(postUpdates).length > 0) {
            post = await this.prisma.post.update({
              where: { id: existing.id },
              data: postUpdates,
            })
          }
          updated++
        } else {
          post = await this.prisma.post.create({
            data: {
              accountId,
              title,
              status: 'PUBLISHED',
              coverUrl: p.coverUrl,
              publishAt,
            },
          })
          created++
        }

        // Upsert PostStats — 写入全部 13 个 PostStats 字段
        await this.prisma.postStats.upsert({
          where: { postId: post.id },
          update: {
            views: p.views || 0,
            likes: p.likes || 0,
            comments: p.comments || 0,
            shares: p.shares || 0,
            saves: p.saves || 0,
            completionRate: p.completionRate || 0,
            fiveSecCompletionRate: p.fiveSecCompletionRate || 0,
            coverClickRate: p.coverClickRate || 0,
            avgPlayDuration: p.avgPlayDuration || 0,
            videoDuration: p.videoDuration || 0,
            danmakuCount: p.danmakuCount || 0,
            dislikes: p.dislikes || 0,
            followsFromPost: p.followsFromPost || 0,
            collectedAt: new Date(),
          },
          create: {
            postId: post.id,
            views: p.views || 0,
            likes: p.likes || 0,
            comments: p.comments || 0,
            shares: p.shares || 0,
            saves: p.saves || 0,
            completionRate: p.completionRate || 0,
            fiveSecCompletionRate: p.fiveSecCompletionRate || 0,
            coverClickRate: p.coverClickRate || 0,
            avgPlayDuration: p.avgPlayDuration || 0,
            videoDuration: p.videoDuration || 0,
            danmakuCount: p.danmakuCount || 0,
            dislikes: p.dislikes || 0,
            followsFromPost: p.followsFromPost || 0,
          },
        })
      } catch (e: any) {
        this.logger.warn(`reportPostStats item error: ${e.message}`)
      }
    }

    this.logger.log(`reportPostStats: ${accountId} created=${created} updated=${updated}`)
    return { success: true, created, updated, total: posts.length }
  }

  // ==================== Token管理 ====================

  /**
   * 刷新指定账号的Token
   */
  async refreshToken(accountId: string): Promise<boolean> {
    return this.oauthService.refreshAccountToken(accountId)
  }

  /**
   * 批量刷新即将过期的Token
   */
  async refreshExpiringTokens() {
    return this.oauthService.refreshExpiringTokens()
  }

  // ==================== 已授权平台列表 ====================

  /**
   * 获取已授权的平台账号列表
   */
  async getAuthorizedAccounts(params: {
    userId?: string
    teamId?: string
    platform?: string
    skip?: number
    take?: number
  }) {
    const { userId, teamId, platform, skip = 0, take = 20 } = params

    const where: any = { status: 'ACTIVE' }
    // 共享模式：跳过 userId 过滤
    if (teamId) where.teamId = teamId
    if (platform) where.platform = platform

    const [accounts, total] = await Promise.all([
      this.prisma.account.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          platform: true,
          platformUserId: true,
          nickname: true,
          avatar: true,
          bio: true,
          followers: true,
          likes: true,
          following: true,
          status: true,
          lastActiveAt: true,
          createdAt: true,
          owner: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.account.count({ where }),
    ])

    // 标记Token状态
    const accountsWithTokenStatus = accounts.map((account: any) => {
      const metadata = (account as any).metadata as Record<string, any>
      const tokenExpiresAt = metadata?.tokenExpiresAt
      let tokenStatus = 'unknown'

      if (tokenExpiresAt) {
        const expiresAt = new Date(tokenExpiresAt).getTime()
        if (Date.now() >= expiresAt) {
          tokenStatus = 'expired'
        } else if (Date.now() >= expiresAt - 3 * 24 * 60 * 60 * 1000) {
          tokenStatus = 'expiring_soon'
        } else {
          tokenStatus = 'valid'
        }
      }

      return {
        ...account,
        tokenStatus,
        hasOAuth: !!metadata?.oauthToken,
      }
    })

    return {
      accounts: accountsWithTokenStatus,
      total,
      skip,
      take,
    }
  }
}
