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

    // Use provided date or default to today
    let targetDate: Date
    if (date) {
      targetDate = new Date(date)
      targetDate.setHours(0, 0, 0, 0)
    } else {
      targetDate = new Date()
      targetDate.setHours(0, 0, 0, 0)
    }
    const platform = account.platform as any

    try {
      const pickNumber = (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) ? value : undefined

      // Upsert DailyStats for the target date (including monetization + store fields)
      const statData = {
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
    if (typeof value !== 'string' || !value.trim()) return undefined

    const raw = value.trim()
    const direct = new Date(raw)
    if (!Number.isNaN(direct.getTime())) return direct

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
