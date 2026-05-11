import { Injectable, Logger } from '@nestjs/common';
import { BrowserPool } from '../uploader/browser-pool';
import { PrismaService } from '../../prisma/prisma.service';
import { encryptCookie } from '../../common/utils/cookie-crypto';
import { BrowserContext, Page } from 'playwright';
import * as crypto from 'crypto';

interface ScanSession {
  clientId: string;
  platform: string;
  userId: string;
  context?: BrowserContext;
  page?: Page;
  timer?: NodeJS.Timeout;
  cancelled: boolean;
  onQrCode: (imageBase64: string) => void;
  onStatus: (status: string, message?: string) => void;
  onSuccess: (accountData: any) => void;
  onError: (error: string) => void;
}

/**
 * Platform login config — URLs that force QR-code login
 * Using the actual login pages, not the dashboards that redirect
 */
const PLATFORM_LOGIN_CONFIG: Record<string, {
  url: string;
  successIndicator: string | RegExp;
}> = {
  DOUYIN: {
    // 创作者内容发布页 → 未登录强制弹出扫码
    url: 'https://creator.douyin.com/creator-micro/content',
    successIndicator: /creator\.douyin\.com\/creator-micro/,
  },
  XIAOHONGSHU: {
    // 创作者发布页 → 未登录强制弹出扫码
    url: 'https://creator.xiaohongshu.com/publish/publish',
    successIndicator: /creator\.xiaohongshu\.com\/(publish|home)/,
  },
  KUAISHOU: {
    // 创作者发布页 → 未登录强制弹出扫码
    url: 'https://cp.kuaishou.com/article/publish',
    successIndicator: /cp\.kuaishou\.com\/(article|profile)/,
  },
  BILIBILI: {
    // B站创作中心 → 未登录强制弹出扫码
    url: 'https://member.bilibili.com/platform/home',
    successIndicator: /member\.bilibili\.com/,
  },
  WEIBO: {
    // 微博扫码登录专用页
    url: 'https://weibo.com/login.php',
    successIndicator: /weibo\.com\/(u\/\d+|home)/,
  },
  WECHAT_VIDEO: {
    url: 'https://channels.weixin.qq.com/',
    successIndicator: /channels\.weixin\.qq\.com\/(platform|web)/,
  },
};

// Broad QR code detection — try many patterns
const QR_SELECTORS = [
  'img[src*="qrcode"]',
  'img[src*="qr_code"]',
  'img[src*="qr-code"]',
  'img[src*="QR"]',
  'img[src*="login"]',
  'canvas[class*="qr"]',
  'canvas[class*="QR"]',
  '.qrcode-img img',
  '.qrcode img',
  '.qr-code img',
  '.qr_code img',
  '.login-qrcode img',
  '.login_qrcode canvas',
  '[class*="qrcode"] img',
  '[class*="qr-code"] img',
  '[class*="qr_code"] img',
  '[class*="QRCode"] img',
  '[class*="scan"] img',
  '#login-qrcode img',
  '#qrcode img',
  '.scan-code img',
];

@Injectable()
export class ScanBindService {
  private readonly logger = new Logger(ScanBindService.name);
  private sessions = new Map<string, ScanSession>();

  constructor(
    private browserPool: BrowserPool,
    private prisma: PrismaService,
  ) {}

  async startScanSession(params: Omit<ScanSession, 'cancelled' | 'context' | 'page' | 'timer'>) {
    const session: ScanSession = { ...params, cancelled: false };
    this.sessions.set(params.clientId, session);

    const config = PLATFORM_LOGIN_CONFIG[params.platform];
    if (!config) {
      params.onError(`Unsupported platform: ${params.platform}`);
      return;
    }

    try {
      params.onStatus('launching', 'Starting browser...');
      const context = await this.browserPool.createContext({ viewport: { width: 1280, height: 800 } });
      session.context = context;
      const page = await this.browserPool.createPage(context);
      session.page = page;

      if (session.cancelled) return this.cleanup(session);

      // Set extra headers to look like a real browser
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      });

      params.onStatus('navigating', 'Opening login page...');
      // Use networkidle to wait for JS-rendered QR code
      await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {
        // Fallback: domcontentloaded if networkidle times out
        return page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      });

      if (session.cancelled) return this.cleanup(session);

      // Wait for JS frameworks to render the QR code
      await page.waitForTimeout(5000);

      params.onStatus('waiting_qr', 'Looking for QR code...');
      await this.pollQrCodeAndStatus(session, config);
    } catch (error: any) {
      if (!session.cancelled) {
        this.logger.error(`Scan session error: ${error.message}`);
        params.onError(error.message || 'Scan process failed');
      }
      this.cleanup(session);
    }
  }

  private async pollQrCodeAndStatus(
    session: ScanSession,
    config: { url: string; successIndicator: string | RegExp },
  ) {
    const { page, onQrCode, onStatus, onSuccess, onError } = session;
    if (!page) return;

    let attempts = 0;
    const maxAttempts = 180; // 6 minutes
    let qrSent = false;

    while (attempts < maxAttempts && !session.cancelled) {
      await page.waitForTimeout(2000);
      attempts++;

      try {
        const currentUrl = page.url();
        const indicator = config.successIndicator;

        // Check if already logged in
        const isLoggedIn = indicator instanceof RegExp
          ? indicator.test(currentUrl)
          : currentUrl.includes(indicator);

        if (isLoggedIn) {
          onStatus('logged_in', 'Login detected, extracting account info...');
          await page.waitForTimeout(2000);
          const accountData = await this.extractAccountInfo(page, session.platform);
          await this.saveAccount({
            platform: session.platform,
            userId: session.userId,
            cookies: accountData.cookies,
            nickname: accountData.nickname,
            avatar: accountData.avatar,
            platformUserId: accountData.platformUserId,
          });
          onSuccess(accountData);
          return;
        }

        // Try to find QR code element
        if (!qrSent) {
          let qrElement = null;

          // Try each selector
          for (const selector of QR_SELECTORS) {
            try {
              qrElement = page.locator(selector).first();
              const count = await page.locator(selector).count();
              if (count > 0) {
                // Check if it's a visible/large enough image
                const box = await qrElement.boundingBox().catch(() => null);
                if (box && box.width > 80 && box.height > 80) {
                  this.logger.log(`Found QR via: ${selector} (${box.width}x${box.height})`);
                  break;
                } else {
                  qrElement = null;
                }
              } else {
                qrElement = null;
              }
            } catch {
              qrElement = null;
            }
          }

          // Fallback: find any large image or canvas
          if (!qrElement) {
            const imgs = page.locator('img');
            const imgCount = await imgs.count();
            for (let i = 0; i < Math.min(imgCount, 50); i++) {
              try {
                const img = imgs.nth(i);
                const box = await img.boundingBox().catch(() => null);
                const src = await img.getAttribute('src').catch(() => '');
                if (box && box.width > 100 && box.height > 100 && box.width < 500 && box.height < 500) {
                  // Check if it looks like a QR code URL
                  if (src && (src.includes('qr') || src.includes('QR') || src.includes('code') || src.includes('scan'))) {
                    qrElement = img;
                    this.logger.log(`Fallback QR via <img> #${i}: ${box.width}x${box.height} src=${src.substring(0, 50)}`);
                    break;
                  }
                }
              } catch { /* continue */ }
            }
          }

          if (qrElement) {
            const screenshot = await qrElement.screenshot({ type: 'png' }).catch(() => null);
            if (screenshot) {
              const base64 = screenshot.toString('base64');
              onQrCode(`data:image/png;base64,${base64}`);
              qrSent = true;
              onStatus('waiting_scan', 'Please scan the QR code with the platform app');
            }
          } else if (attempts > 10 && !qrSent) {
            // Take viewport screenshot as last resort
            const viewportShot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1280, height: 720 } }).catch(() => null);
            if (viewportShot) {
              this.logger.warn('No QR element found, sending viewport screenshot');
              const base64 = viewportShot.toString('base64');
              onQrCode(`data:image/png;base64,${base64}`);
              qrSent = true;
              onStatus('waiting_scan', 'Please scan the QR code on screen');
            }
          }
        }
      } catch (err: any) {
        this.logger.warn(`Poll error: ${err.message}`);
      }
    }

    if (!session.cancelled) {
      onError('QR code scan timed out. Please try again.');
    }
    this.cleanup(session);
  }

  /**
   * Extract account info after successful login
   */
  private async extractAccountInfo(page: Page, platform: string) {
    const cookies = await page.context().cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    let nickname = '';
    let avatar = '';
    let platformUserId = '';

    try {
      await page.waitForTimeout(3000);

      switch (platform) {
        case 'DOUYIN':
          await page.waitForTimeout(3000);
          nickname = await page.$eval('[class*="name"], [class*="nickname"], .account-name span', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img, .avatar-img img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/(?:uid|user_id|passport_csrf_token)=([^;]+)/);
            return match ? match[1].substring(0, 30) : '';
          });
          break;

        case 'XIAOHONGSHU':
          await page.waitForTimeout(3000);
          nickname = await page.$eval('[class*="name"], [class*="nickname"], .username', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img, .avatar-img img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/a1=([^;]+)/);
            return match ? match[1].substring(0, 20) : '';
          });
          break;

        case 'KUAISHOU':
          await page.waitForTimeout(3000);
          nickname = await page.$eval('[class*="name"], [class*="nickname"]', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img, [class*="head"] img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/userId=([^;]+)/);
            return match ? match[1] : '';
          });
          break;

        case 'BILIBILI':
          await page.waitForTimeout(2000);
          nickname = await page.$eval('[class*="nickname"], .h-name', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img, .h-avatar img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/DedeUserID=(\d+)/);
            return match ? match[1] : '';
          });
          break;

        case 'WEIBO':
          await page.waitForTimeout(3000);
          nickname = await page.$eval('[class*="name"], .username', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img, .face img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/uid=(\d+)/);
            return match ? match[1] : '';
          });
          break;

        case 'WECHAT_VIDEO':
          await page.waitForTimeout(3000);
          nickname = await page.$eval('[class*="nickname"], [class*="name"]', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img, [class*="head"] img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/finder_uid=([^;]+)/);
            return match ? match[1] : '';
          });
          break;
      }
    } catch (err: any) {
      this.logger.warn(`Extract info partial failure (${platform}): ${err.message}`);
    }

    return {
      cookies: cookieStr,
      nickname: nickname || `${platform}_user`,
      avatar,
      platformUserId: platformUserId || `scan_${Date.now()}`,
    };
  }

  private async saveAccount(params: {
    platform: string;
    userId: string;
    cookies: string;
    nickname: string;
    avatar: string;
    platformUserId: string;
  }) {
    const encryptionKey = process.env.COOKIE_ENCRYPTION_KEY;
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('COOKIE_ENCRYPTION_KEY not configured');
    }

    const encryptedCookies = encryptCookie(params.cookies, encryptionKey);

    const account = await this.prisma.account.upsert({
      where: {
        platform_platformUserId: {
          platform: params.platform as any,
          platformUserId: params.platformUserId,
        },
      },
      update: {
        cookies: encryptedCookies,
        nickname: params.nickname,
        avatar: params.avatar,
      },
      create: {
        platform: params.platform as any,
        platformUserId: params.platformUserId,
        nickname: params.nickname,
        avatar: params.avatar,
        cookies: encryptedCookies,
        userId: params.userId,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    const { cookies, ...rest } = account;
    return { ...rest, hasCookies: true };
  }

  cancelSession(clientId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      session.cancelled = true;
      this.cleanup(session);
    }
  }

  private async cleanup(session: ScanSession) {
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = undefined;
    }
    if (session.context) {
      try { await session.context.close(); } catch { /* ignore */ }
      session.context = undefined;
    }
    session.page = undefined;
    this.sessions.delete(session.clientId);
  }
}
