import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { BrowserPool } from '../uploader/browser-pool'
import { CookieManager } from '../uploader/cookie-manager'
import { Platform } from '../../common/prisma-enums'
import { NotificationsService } from '../notifications/notifications.service'
import { StoredCookie } from '../uploader/base-uploader'

interface AccountMetrics {
  followers: number
  likes: number
  views: number
  comments: number
  shares?: number
  unfollows?: number
}

/**
 * 鏁版嵁閲囬泦瀹氭椂浠诲姟
 * 姣忔棩鍑屾櫒 2:00 鑷姩鎶撳彇鍚勫钩鍙拌处鍙风殑绮変笣/浜掑姩鏁版嵁
 */
@Injectable()
export class DataSyncScheduler {
  private readonly logger = new Logger(DataSyncScheduler.name)
  private isRunning = false
  private readonly beijingOffsetMs = 8 * 60 * 60 * 1000

  constructor(
    private prisma: PrismaService,
    private browserPool: BrowserPool,
    private cookieManager: CookieManager,
    private notificationsService: NotificationsService,
  ) {}

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

  /**
   * 姣忓ぉ鍑屾櫒 2:00 鎵ц鏁版嵁閲囬泦
   */
  @Cron('0 2 * * *')
  async handleDailySync() {
    if (this.isRunning) {
      this.logger.warn('[garbled]')
      return
    }

    this.isRunning = true
    this.logger.log('每日数据采集任务启动')
    
    try {
      const accounts = await this.prisma.account.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, platform: true, cookies: true, nickname: true },
      })
    
      this.logger.log(`Data sync: ${accounts.length} accounts to collect`)
    
      let successCount = 0
      let failCount = 0
      let skippedCount = 0
    
      for (const account of accounts) {
        try {
          const cookies = account.cookies ? this.cookieManager.decryptCookie(account.cookies) : []
    
          if (cookies.length === 0) {
            skippedCount++
            this.logger.warn(
              `[${account.platform}] 账号 "${account.nickname}" 无Cookie，跳过浏览器采集。请通过桌面伴侣或平台授权登录以保存Cookie。`,
            )
            continue
          }
    
          const result = await this.collectMetrics(account.platform, account.id, cookies)
    
          if (result) {
            await this.saveMetrics(account.id, account.platform, result.metrics)
            successCount++

            // 回存浏览器刷新后的 Cookie（延长登录态寿命）
            if (result.refreshedCookies && result.refreshedCookies.length > 0) {
              await this.cookieManager.saveCookies(account.id, result.refreshedCookies)
              this.logger.log(
                `[${account.platform}] "${account.nickname}" Cookie已回存 (${result.refreshedCookies.length} 条)`,
              )
            }
          }
    
          // 每个账号间隔 5-10 秒，避免频率过高
          await this.delay(5000 + Math.random() * 5000)
        } catch (error: any) {
          failCount++
          this.logger.warn(`Collection failed [${account.nickname}]: ${error.message}`)
        }
      }
    
      this.logger.log(`Data collection complete: ${successCount} success, ${failCount} failed, ${skippedCount} skipped`)
    
      if (skippedCount === accounts.length && accounts.length > 0) {
        this.logger.warn(
          `所有 ${accounts.length} 个账号均无Cookie，自动采集全部跳过！` +
          `请确保：1) 桌面伴侣已运行并上报数据，或 2) 在前端平台管理页面完成账号授权登录以保存Cookie。`,
        )
      }
    } catch (error: any) {
      this.logger.error(`每日数据采集异常: ${error.message}`, error.stack)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 鏍规嵁骞冲彴閲囬泦鏁版嵁
   */
  private async collectMetrics(
    platform: Platform,
    accountId: string,
    cookies: StoredCookie[],
  ): Promise<{ metrics: AccountMetrics; refreshedCookies?: StoredCookie[] } | null> {
    const context = await this.browserPool.createContext({ cookies })
    const page = await this.browserPool.createPage(context)

    try {
      let metrics: AccountMetrics | null = null
      switch (platform) {
        case Platform.DOUYIN:
          metrics = await this.collectDouyin(page)
          break
        case Platform.XIAOHONGSHU:
          metrics = await this.collectXiaohongshu(page)
          break
        case Platform.KUAISHOU:
          metrics = await this.collectKuaishou(page)
          break
        case Platform.BILIBILI:
          metrics = await this.collectBilibili(page)
          break
        case Platform.WEIBO:
          metrics = await this.collectWeibo(page)
          break
        case Platform.WECHAT_VIDEO:
          metrics = await this.collectWechatVideo(page)
          break
        default:
          metrics = null
      }

      if (metrics) {
        // 采集成功，提取浏览器刷新后的 Cookie
        try {
          const refreshedCookies = await context.cookies() as StoredCookie[]
          return { metrics, refreshedCookies }
        } catch {
          return { metrics }
        }
      }

      return null
    } finally {
      await context.close()
    }
  }

  private async collectDouyin(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://creator.douyin.com/creator-micro/data/overview', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(3000)

    if (page.url().includes('login')) return null

    // 灏濊瘯浠庢暟鎹瑙堥〉鎻愬彇鏁板瓧
    const followers = await this.extractNumber(page, '')
    const likes = await this.extractNumber(page, '')
    const views = await this.extractNumber(page, '')

    return { followers, likes, views, comments: 0 }
  }

  private async collectXiaohongshu(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://creator.xiaohongshu.com/statistics', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(3000)

    if (page.url().includes('login')) return null

    const followers = await this.extractNumber(page, '')
    const likes = await this.extractNumber(page, '')
    const views = await this.extractNumber(page, '')

    return { followers, likes, views, comments: 0 }
  }

  private async collectKuaishou(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://cp.kuaishou.com/profile', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(3000)

    if (page.url().includes('login')) return null

    const followers = await this.extractNumber(page, '')
    const likes = await this.extractNumber(page, '')
    const views = await this.extractNumber(page, '')

    return { followers, likes, views, comments: 0 }
  }

  private async collectBilibili(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://member.bilibili.com/platform/home', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(3000)

    if (page.url().includes('passport')) return null

    const followers = await this.extractNumber(page, '')
    const likes = await this.extractNumber(page, '')
    const views = await this.extractNumber(page, '')

    return { followers, likes, views, comments: 0 }
  }

  private async collectWeibo(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    if (page.url().includes('login')) return null

    const followers = await this.extractNumber(page, '')
    const likes = await this.extractNumber(page, '[class*="like"]')
    const views = await this.extractNumber(page, '[class*="read"]')

    return { followers, likes, views: views || 0, comments: 0 }
  }

  private async collectWechatVideo(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://channels.weixin.qq.com/platform/post/list', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForTimeout(3000)

    if (page.url().includes('login')) return null

    const followers = await this.extractNumber(page, '')
    const likes = await this.extractNumber(page, '')

    return { followers, likes, views: 0, comments: 0 }
  }

  /**
   * 浠庨〉闈㈡彁鍙栨暟瀛楋紙鏀寔澶氫釜閫夋嫨鍣ㄥ皾璇曪級
   */
  private async extractNumber(page: any, ...selectors: string[]): Promise<number> {
    for (const selector of selectors) {
      try {
        const el = page.locator(selector).first()
        if (await el.isVisible().catch(() => false)) {
          const text = await el.textContent()
          if (text) {
            // 澶勭悊 ""12.5w"[garbled]"
            return this.parseChineseNumber(text.trim())
          }
        }
      } catch {
        continue
      }
    }
    return 0
  }

  /**
   * 瑙ｆ瀽涓枃鏁板瓧鏍煎紡
   */
  private parseChineseNumber(text: string): number {
    const cleaned = text.replace(/[,锛孿s]/g, '')
    if (cleaned.includes('万')) {
      const num = parseFloat(cleaned.replace(/[万亿]/g, ''))
      return Math.round(num * 10000)
    }
    if (cleaned.includes('亿')) {
      const num = parseFloat(cleaned.replace(/[万亿]/g, ''))
      return Math.round(num * 100000000)
    }
    const num = parseFloat(cleaned)
    return isNaN(num) ? 0 : Math.round(num)
  }

  /**
   * 淇濆瓨閲囬泦鏁版嵁鍒?DailyStats 琛?
   */
  private async saveMetrics(accountId: string, platform: Platform, metrics: AccountMetrics) {
    const today = this.getBeijingDayStart()

    // 查询相邻上一条快照用于计算增量
    const previousStats = await this.prisma.dailyStats.findFirst({
      where: { accountId, date: { lt: today } },
      select: { followers: true, views: true, likes: true, comments: true, shares: true },
      orderBy: { date: 'desc' },
    })

    const followersIncrement = previousStats
      ? Math.max(0, metrics.followers - previousStats.followers)
      : 0
    const viewsIncrement = previousStats ? Math.max(0, metrics.views - previousStats.views) : 0
    const likesIncrement = previousStats ? Math.max(0, metrics.likes - previousStats.likes) : 0
    const commentsIncrement = previousStats
      ? Math.max(0, metrics.comments - previousStats.comments)
      : 0
    const sharesIncrement = previousStats
      ? Math.max(0, (metrics.shares || 0) - previousStats.shares)
      : 0

    await this.prisma.dailyStats.upsert({
      where: { accountId_date: { accountId, date: today } },
      update: {
        followers: metrics.followers,
        likes: metrics.likes,
        views: metrics.views,
        comments: metrics.comments,
        shares: metrics.shares || 0,
        followersIncrement,
        viewsIncrement,
        likesIncrement,
        commentsIncrement,
        sharesIncrement,
        unfollows: metrics.unfollows || 0,
      },
      create: {
        accountId,
        platform,
        date: today,
        followers: metrics.followers,
        likes: metrics.likes,
        views: metrics.views,
        comments: metrics.comments,
        shares: metrics.shares || 0,
        followersIncrement,
        viewsIncrement,
        likesIncrement,
        commentsIncrement,
        sharesIncrement,
        unfollows: metrics.unfollows || 0,
      },
    })

    // 鍚屾椂鏇存柊 Account 琛ㄧ殑鏈€鏂扮矇涓濇暟
    await this.prisma.account.update({
      where: { id: accountId },
      data: { followers: metrics.followers, likes: metrics.likes },
    })
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  // ==================== 凭据健康检查 ====================

  /**
   * 每天早上 8:00 检查所有账号的认证凭据状态
   * 对缺少凭据或凭据已过期的账号创建通知提醒
   */
  @Cron('0 8 * * *')
  async handleCredentialHealthCheck() {
    this.logger.log('凭据健康检查开始...')

    try {
      const accounts = await this.prisma.account.findMany({
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          platform: true,
          nickname: true,
          cookies: true,
          metadata: true,
          userId: true,
          cookieSavedAt: true,
        },
      })

      const platformNames: Record<string, string> = {
        DOUYIN: '抖音',
        KUAISHOU: '快手',
        XIAOHONGSHU: '小红书',
        WECHAT_VIDEO: '微信视频号',
        BILIBILI: 'B站',
        WEIBO: '微博',
      }

      let missingCount = 0
      let expiredCount = 0
      let staleCount = 0
      const COOKIE_STALE_DAYS = 14 // Cookie超过14天未刷新视为“即将过期”
      const COOKIE_MAX_DAYS = 30   // Cookie超过30天未刷新视为“已过期”

      for (const account of accounts) {
        const hasCookies = account.cookies && account.cookies.length > 0
        const metadata = (() => {
          try { return JSON.parse(account.metadata || '{}') } catch { return {} }
        })()
        const hasToken = !!metadata.oauthToken
        const tokenExpiresAt = metadata.tokenExpiresAt
          ? new Date(metadata.tokenExpiresAt)
          : null
        const isTokenExpired = tokenExpiresAt && tokenExpiresAt < new Date()
        const isTokenExpiringSoon =
          tokenExpiresAt &&
          !isTokenExpired &&
          tokenExpiresAt < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)

        const platformLabel = platformNames[account.platform] || account.platform

        if (!hasCookies && !hasToken) {
          // 无任何凭据
          missingCount++
          this.logger.warn(
            `[凭据缺失] ${platformLabel} 账号 "${account.nickname}" 无Cookie和Token，自动采集将无法工作`,
          )

          // 检查是否已有未读的同类型通知（避免重复）
          const existingNotification = await this.prisma.notification.findFirst({
            where: {
              userId: account.userId,
              type: 'CREDENTIAL_EXPIRED',
              read: false,
              metadata: { contains: account.id },
            },
          })

          if (!existingNotification) {
            await this.notificationsService.create({
              userId: account.userId,
              type: 'CREDENTIAL_EXPIRED' as any,
              title: `账号凭据缺失: ${account.nickname}`,
              content: `${platformLabel} 账号 "${account.nickname}" 未保存Cookie或Token，每日自动采集已跳过。请通过桌面伴侣登录或在前端平台管理页完成授权。`,
              metadata: { accountId: account.id, platform: account.platform, reason: 'no_credentials' },
            })
          }
        } else if (isTokenExpired) {
          // Token 已过期
          expiredCount++
          this.logger.warn(
            `[Token过期] ${platformLabel} 账号 "${account.nickname}" OAuth Token 已于 ${tokenExpiresAt!.toISOString()} 过期`,
          )

          const existingNotification = await this.prisma.notification.findFirst({
            where: {
              userId: account.userId,
              type: 'CREDENTIAL_EXPIRED',
              read: false,
              metadata: { contains: account.id },
            },
          })

          if (!existingNotification) {
            await this.notificationsService.create({
              userId: account.userId,
              type: 'CREDENTIAL_EXPIRED' as any,
              title: `Token已过期: ${account.nickname}`,
              content: `${platformLabel} 账号 "${account.nickname}" 的OAuth Token 已过期。请重新授权以恢复自动采集。`,
              metadata: { accountId: account.id, platform: account.platform, reason: 'token_expired', expiredAt: tokenExpiresAt!.toISOString() },
            })
          }
        } else if (isTokenExpiringSoon) {
          // Token 即将过期（3天内）
          this.logger.warn(
            `[Token即将过期] ${platformLabel} 账号 "${account.nickname}" Token 将于 ${tokenExpiresAt!.toISOString()} 过期`,
          )

          const existingNotification = await this.prisma.notification.findFirst({
            where: {
              userId: account.userId,
              type: 'CREDENTIAL_EXPIRED',
              read: false,
              metadata: { contains: account.id },
            },
          })

          if (!existingNotification) {
            await this.notificationsService.create({
              userId: account.userId,
              type: 'CREDENTIAL_EXPIRED' as any,
              title: `Token即将过期: ${account.nickname}`,
              content: `${platformLabel} 账号 "${account.nickname}" 的OAuth Token 将于 ${tokenExpiresAt!.toLocaleDateString('zh-CN')} 过期，请尽快刷新。`,
              metadata: { accountId: account.id, platform: account.platform, reason: 'token_expiring_soon', expiresAt: tokenExpiresAt!.toISOString() },
            })
          }
        } else if (hasCookies && account.cookieSavedAt) {
          // Cookie 存在但已保存超过 COOKIE_STALE_DAYS 天，检查是否老化
          const daysSinceSaved = (Date.now() - account.cookieSavedAt.getTime()) / (1000 * 60 * 60 * 24)

          if (daysSinceSaved > COOKIE_MAX_DAYS) {
            staleCount++
            this.logger.warn(
              `[Cookie老化] ${platformLabel} 账号 "${account.nickname}" Cookie 已 ${Math.floor(daysSinceSaved)} 天未刷新，可能已失效`,
            )

            const existingNotification = await this.prisma.notification.findFirst({
              where: {
                userId: account.userId,
                type: 'CREDENTIAL_EXPIRED',
                read: false,
                metadata: { contains: account.id },
              },
            })

            if (!existingNotification) {
              await this.notificationsService.create({
                userId: account.userId,
                type: 'CREDENTIAL_EXPIRED' as any,
                title: `Cookie可能已失效: ${account.nickname}`,
                content: `${platformLabel} 账号 "${account.nickname}" 的Cookie 已 ${Math.floor(daysSinceSaved)} 天未刷新，登录态可能已失效。如采集失败请重新登录。`,
                metadata: { accountId: account.id, platform: account.platform, reason: 'cookie_stale', daysSinceSaved: Math.floor(daysSinceSaved) },
              })
            }
          } else if (daysSinceSaved > COOKIE_STALE_DAYS) {
            this.logger.warn(
              `[Cookie即将老化] ${platformLabel} 账号 "${account.nickname}" Cookie 已 ${Math.floor(daysSinceSaved)} 天未刷新`,
            )
          }
        }
      }

      this.logger.log(
        `凭据健康检查完成: ${accounts.length} 个账号, ${missingCount} 缺少凭据, ${expiredCount} Token过期, ${staleCount} Cookie老化`,
      )
    } catch (error: any) {
      this.logger.error(`凭据健康检查失败: ${error.message}`, error.stack)
    }
  }
}
