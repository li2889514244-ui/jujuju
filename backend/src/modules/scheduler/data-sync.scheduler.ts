import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowserPool } from '../uploader/browser-pool';
import { CookieManager } from '../uploader/cookie-manager';
import { Platform } from '../../common/prisma-enums';

interface AccountMetrics {
  followers: number;
  likes: number;
  views: number;
  comments: number;
}

/**
 * 鏁版嵁閲囬泦瀹氭椂浠诲姟
 * 姣忔棩鍑屾櫒 2:00 鑷姩鎶撳彇鍚勫钩鍙拌处鍙风殑绮変笣/浜掑姩鏁版嵁
 */
@Injectable()
export class DataSyncScheduler {
  private readonly logger = new Logger(DataSyncScheduler.name);
  private isRunning = false;

  constructor(
    private prisma: PrismaService,
    private browserPool: BrowserPool,
    private cookieManager: CookieManager,
  ) {}

  /**
   * 姣忓ぉ鍑屾櫒 2:00 鎵ц鏁版嵁閲囬泦
   */
  @Cron('0 2 * * *')
  async handleDailySync() {
    if (this.isRunning) {
      this.logger.warn('[garbled]');
      return;
    }

    this.isRunning = true;
    this.logger.log('');

    try {
      const accounts = await this.prisma.account.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, platform: true, cookies: true, nickname: true },
      });

      this.logger.log(`Data sync: ${accounts.length} accounts to collect`);

      let successCount = 0;
      let failCount = 0;

      for (const account of accounts) {
        try {
          const cookies = account.cookies
            ? this.cookieManager.decryptCookie(account.cookies)
            : [];

          if (cookies.length === 0) {
            this.logger.debug(`Skipping account without cookies: ${account.nickname}`);
            continue;
          }

          const metrics = await this.collectMetrics(account.platform, cookies);

          if (metrics) {
            await this.saveMetrics(account.id, account.platform, metrics);
            successCount++;
          }

          // 姣忎釜璐﹀彿闂撮殧 5-10 绉掞紝閬垮厤棰戠巼杩囬珮
          await this.delay(5000 + Math.random() * 5000);
        } catch (error: any) {
          failCount++;
          this.logger.warn(`Collection failed [${account.nickname}]: ${error.message}`);
        }
      }

      this.logger.log(`Data collection complete: ${successCount} success, ${failCount} failed`);
    } catch (error: any) {
      this.logger.error('', error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 鏍规嵁骞冲彴閲囬泦鏁版嵁
   */
  private async collectMetrics(platform: Platform, cookies: any[]): Promise<AccountMetrics | null> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      switch (platform) {
        case Platform.DOUYIN:
          return await this.collectDouyin(page);
        case Platform.XIAOHONGSHU:
          return await this.collectXiaohongshu(page);
        case Platform.KUAISHOU:
          return await this.collectKuaishou(page);
        case Platform.BILIBILI:
          return await this.collectBilibili(page);
        case Platform.WEIBO:
          return await this.collectWeibo(page);
        case Platform.WECHAT_VIDEO:
          return await this.collectWechatVideo(page);
        default:
          return null;
      }
    } finally {
      await context.close();
    }
  }

  private async collectDouyin(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://creator.douyin.com/creator-micro/data/overview', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) return null;

    // 灏濊瘯浠庢暟鎹瑙堥〉鎻愬彇鏁板瓧
    const followers = await this.extractNumber(page, '');
    const likes = await this.extractNumber(page, '');
    const views = await this.extractNumber(page, '');

    return { followers, likes, views, comments: 0 };
  }

  private async collectXiaohongshu(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://creator.xiaohongshu.com/statistics', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) return null;

    const followers = await this.extractNumber(page, '');
    const likes = await this.extractNumber(page, '');
    const views = await this.extractNumber(page, '');

    return { followers, likes, views, comments: 0 };
  }

  private async collectKuaishou(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://cp.kuaishou.com/profile', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) return null;

    const followers = await this.extractNumber(page, '');
    const likes = await this.extractNumber(page, '');
    const views = await this.extractNumber(page, '');

    return { followers, likes, views, comments: 0 };
  }

  private async collectBilibili(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://member.bilibili.com/platform/home', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (page.url().includes('passport')) return null;

    const followers = await this.extractNumber(page, '');
    const likes = await this.extractNumber(page, '');
    const views = await this.extractNumber(page, '');

    return { followers, likes, views, comments: 0 };
  }

  private async collectWeibo(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) return null;

    const followers = await this.extractNumber(page, '');
    const likes = await this.extractNumber(page, '[class*="like"]');
    const views = await this.extractNumber(page, '[class*="read"]');

    return { followers, likes, views: views || 0, comments: 0 };
  }

  private async collectWechatVideo(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://channels.weixin.qq.com/platform/post/list', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) return null;

    const followers = await this.extractNumber(page, '');
    const likes = await this.extractNumber(page, '');

    return { followers, likes, views: 0, comments: 0 };
  }

  /**
   * 浠庨〉闈㈡彁鍙栨暟瀛楋紙鏀寔澶氫釜閫夋嫨鍣ㄥ皾璇曪級
   */
  private async extractNumber(page: any, ...selectors: string[]): Promise<number> {
    for (const selector of selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible().catch(() => false)) {
          const text = await el.textContent();
          if (text) {
            // 澶勭悊 ""12.5w"[garbled]"
            return this.parseChineseNumber(text.trim());
          }
        }
      } catch {
        continue;
      }
    }
    return 0;
  }

  /**
   * 瑙ｆ瀽涓枃鏁板瓧鏍煎紡
   */
  private parseChineseNumber(text: string): number {
    const cleaned = text.replace(/[,锛孿s]/g, '');
    if (cleaned.includes('万')) {
      const num = parseFloat(cleaned.replace(/[万亿]/g, ''));
      return Math.round(num * 10000);
    }
    if (cleaned.includes('亿')) {
      const num = parseFloat(cleaned.replace(/[万亿]/g, ''));
      return Math.round(num * 100000000);
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num);
  }

  /**
   * 淇濆瓨閲囬泦鏁版嵁鍒?DailyStats 琛?
   */
  private async saveMetrics(accountId: string, platform: Platform, metrics: AccountMetrics) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.dailyStats.upsert({
      where: { accountId_date: { accountId, date: today } },
      update: {
        followers: metrics.followers,
        likes: metrics.likes,
        views: metrics.views,
        comments: metrics.comments,
      },
      create: {
        accountId,
        platform,
        date: today,
        followers: metrics.followers,
        likes: metrics.likes,
        views: metrics.views,
        comments: metrics.comments,
      },
    });

    // 鍚屾椂鏇存柊 Account 琛ㄧ殑鏈€鏂扮矇涓濇暟
    await this.prisma.account.update({
      where: { id: accountId },
      data: { followers: metrics.followers, likes: metrics.likes },
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
