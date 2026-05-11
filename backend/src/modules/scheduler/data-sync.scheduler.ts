import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { BrowserPool } from '../uploader/browser-pool';
import { CookieManager } from '../uploader/cookie-manager';
import { Platform } from '@prisma/client';

interface AccountMetrics {
  followers: number;
  likes: number;
  views: number;
  comments: number;
}

/**
 * 数据采集定时任务
 * 每日凌晨 2:00 自动抓取各平台账号的粉丝/互动数据
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
   * 每天凌晨 2:00 执行数据采集
   */
  @Cron('0 2 * * *')
  async handleDailySync() {
    if (this.isRunning) {
      this.logger.warn('数据采集任务仍在运行，跳过');
      return;
    }

    this.isRunning = true;
    this.logger.log('开始每日数据采集...');

    try {
      const accounts = await this.prisma.account.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, platform: true, cookies: true, nickname: true },
      });

      this.logger.log(`共 ${accounts.length} 个活跃账号需要采集`);

      let successCount = 0;
      let failCount = 0;

      for (const account of accounts) {
        try {
          const cookies = account.cookies
            ? this.cookieManager.decryptCookies(account.cookies)
            : [];

          if (cookies.length === 0) {
            this.logger.debug(`跳过无 Cookie 账号: ${account.nickname}`);
            continue;
          }

          const metrics = await this.collectMetrics(account.platform, cookies);

          if (metrics) {
            await this.saveMetrics(account.id, account.platform, metrics);
            successCount++;
          }

          // 每个账号间隔 5-10 秒，避免频率过高
          await this.delay(5000 + Math.random() * 5000);
        } catch (error: any) {
          failCount++;
          this.logger.warn(`采集失败 [${account.nickname}]: ${error.message}`);
        }
      }

      this.logger.log(`数据采集完成: 成功 ${successCount}, 失败 ${failCount}`);
    } catch (error: any) {
      this.logger.error('数据采集调度异常', error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 根据平台采集数据
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

    // 尝试从数据概览页提取数字
    const followers = await this.extractNumber(page, ':text("粉丝") + span, [class*="fans"] .number');
    const likes = await this.extractNumber(page, ':text("获赞") + span, [class*="like"] .number');
    const views = await this.extractNumber(page, ':text("播放") + span, [class*="play"] .number');

    return { followers, likes, views, comments: 0 };
  }

  private async collectXiaohongshu(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://creator.xiaohongshu.com/statistics', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) return null;

    const followers = await this.extractNumber(page, '[class*="fans"], :text("粉丝") ~ *');
    const likes = await this.extractNumber(page, '[class*="like"], :text("获赞") ~ *');
    const views = await this.extractNumber(page, '[class*="view"], :text("阅读") ~ *');

    return { followers, likes, views, comments: 0 };
  }

  private async collectKuaishou(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://cp.kuaishou.com/profile', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) return null;

    const followers = await this.extractNumber(page, '[class*="fans"], :text("粉丝") ~ *');
    const likes = await this.extractNumber(page, '[class*="like"], :text("获赞") ~ *');
    const views = await this.extractNumber(page, '[class*="play"], :text("播放") ~ *');

    return { followers, likes, views, comments: 0 };
  }

  private async collectBilibili(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://member.bilibili.com/platform/home', {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(3000);

    if (page.url().includes('passport')) return null;

    const followers = await this.extractNumber(page, '[class*="fans"], :text("粉丝") ~ *');
    const likes = await this.extractNumber(page, '[class*="like"], :text("获赞") ~ *');
    const views = await this.extractNumber(page, '[class*="play"], :text("播放") ~ *');

    return { followers, likes, views, comments: 0 };
  }

  private async collectWeibo(page: any): Promise<AccountMetrics | null> {
    await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    if (page.url().includes('login')) return null;

    const followers = await this.extractNumber(page, '[class*="followers"], :text("粉丝") ~ *');
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

    const followers = await this.extractNumber(page, '[class*="fans"], :text("关注") ~ *');
    const likes = await this.extractNumber(page, '[class*="like"], :text("点赞") ~ *');

    return { followers, likes, views: 0, comments: 0 };
  }

  /**
   * 从页面提取数字（支持多个选择器尝试）
   */
  private async extractNumber(page: any, ...selectors: string[]): Promise<number> {
    for (const selector of selectors) {
      try {
        const el = page.locator(selector).first();
        if (await el.isVisible().catch(() => false)) {
          const text = await el.textContent();
          if (text) {
            // 处理 "1.2万" "12.5w" 等格式
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
   * 解析中文数字格式
   */
  private parseChineseNumber(text: string): number {
    const cleaned = text.replace(/[,，\s]/g, '');
    if (cleaned.includes('万') || cleaned.toLowerCase().includes('w')) {
      const num = parseFloat(cleaned.replace(/[万wW]/g, ''));
      return Math.round(num * 10000);
    }
    if (cleaned.includes('亿')) {
      const num = parseFloat(cleaned.replace('亿', ''));
      return Math.round(num * 100000000);
    }
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num);
  }

  /**
   * 保存采集数据到 DailyStats 表
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

    // 同时更新 Account 表的最新粉丝数
    await this.prisma.account.update({
      where: { id: accountId },
      data: { followers: metrics.followers },
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
