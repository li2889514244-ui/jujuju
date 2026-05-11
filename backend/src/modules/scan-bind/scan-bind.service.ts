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
 * 各平台创作者后台登录页配置
 */
const PLATFORM_LOGIN_CONFIG: Record<string, {
  url: string;
  qrSelector: string;
  successIndicator: string;
  profileUrl?: string;
}> = {
  DOUYIN: {
    url: 'https://creator.douyin.com/',
    qrSelector: 'img[src*="qrcode"], img[src*="qr_code"], .qrcode-img img, .qr-code img, [class*="qrcode"] img, [class*="qr-login"] img',
    successIndicator: '/creator-micro/home',
  },
  XIAOHONGSHU: {
    url: 'https://creator.xiaohongshu.com/login',
    qrSelector: '.qrcode-image img, [class*="qr-code"] img, .login-qrcode img',
    successIndicator: '/home',
  },
  KUAISHOU: {
    url: 'https://cp.kuaishou.com/article/publish',
    qrSelector: '.qr-code img, [class*="qrcode"] img, .scan-login img',
    successIndicator: '/article/publish/single',
  },
  BILIBILI: {
    url: 'https://passport.bilibili.com/login',
    qrSelector: '.login-scan-box img, [class*="qrcode"] img, .qr-image img',
    successIndicator: 'member.bilibili.com',
  },
  WEIBO: {
    url: 'https://weibo.com/login.php',
    qrSelector: '.qr-code img, [class*="qrcode"] img, .login_qrcode img',
    successIndicator: 'weibo.com',
  },
  WECHAT_VIDEO: {
    url: 'https://channels.weixin.qq.com/platform/login',
    qrSelector: '.qr-code img, [class*="qrcode"] img, .login__qrcode img, .wrp_code img',
    successIndicator: '/platform',
  },
};

@Injectable()
export class ScanBindService {
  private readonly logger = new Logger(ScanBindService.name);
  private sessions = new Map<string, ScanSession>();

  constructor(
    private browserPool: BrowserPool,
    private prisma: PrismaService,
  ) {}

  /**
   * 启动扫码绑定会话
   */
  async startScanSession(params: Omit<ScanSession, 'cancelled' | 'context' | 'page' | 'timer'>) {
    const session: ScanSession = { ...params, cancelled: false };
    this.sessions.set(params.clientId, session);

    const config = PLATFORM_LOGIN_CONFIG[params.platform];
    if (!config) {
      params.onError(`不支持的平台: ${params.platform}`);
      return;
    }

    try {
      params.onStatus('launching', '正在启动浏览器...');

      // 创建独立浏览器上下文（使用随机指纹，绑定成功后再关联 accountId）
      const context = await this.browserPool.createContext();
      session.context = context;

      const page = await this.browserPool.createPage(context);
      session.page = page;

      if (session.cancelled) return this.cleanup(session);

      params.onStatus('navigating', '正在打开登录页...');
      await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      if (session.cancelled) return this.cleanup(session);

      // 等待页面加载完成
      await page.waitForTimeout(2000);

      params.onStatus('waiting_qr', '正在获取二维码...');

      // 开始轮询二维码和登录状态
      await this.pollQrCodeAndStatus(session, config);
    } catch (error: any) {
      if (!session.cancelled) {
        this.logger.error(`扫码会话异常: ${error.message}`);
        params.onError(error.message || '扫码流程异常');
      }
      this.cleanup(session);
    }
  }

  /**
   * 轮询二维码截图 + 检测登录状态
   */
  private async pollQrCodeAndStatus(
    session: ScanSession,
    config: { url: string; qrSelector: string; successIndicator: string },
  ) {
    const { page, onQrCode, onStatus, onSuccess, onError } = session;
    if (!page) return;

    let attempts = 0;
    const maxAttempts = 120; // 最多轮询 120 次（约 2 分钟）
    let lastQrHash = '';

    const poll = async () => {
      if (session.cancelled || !page) return;
      attempts++;

      if (attempts > maxAttempts) {
        onError('二维码已过期，请重新扫码');
        this.cleanup(session);
        return;
      }

      try {
        // 检测是否已登录成功（URL 变化）
        const currentUrl = page.url();
        if (currentUrl.includes(config.successIndicator)) {
          onStatus('logged_in', '登录成功，正在获取账号信息...');
          await this.handleLoginSuccess(session);
          return;
        }

        // 尝试截取二维码区域
        const qrImage = await this.captureQrCode(page, config.qrSelector);
        if (qrImage) {
          // 只在二维码变化时推送（避免重复推送相同图片）
          const hash = crypto.createHash('md5').update(qrImage.substring(0, 200)).digest('hex');
          if (hash !== lastQrHash) {
            lastQrHash = hash;
            onQrCode(qrImage);
            onStatus('scan_ready', '请使用手机扫描二维码');
          }
        } else if (attempts <= 5) {
          // 前几次找不到二维码，可能页面还在加载
          onStatus('waiting_qr', '正在等待二维码加载...');
        } else {
          // 尝试整页截图作为 fallback
          const fullScreenshot = await page.screenshot({ type: 'png' });
          const base64 = fullScreenshot.toString('base64');
          onQrCode(`data:image/png;base64,${base64}`);
          onStatus('scan_ready', '请使用手机扫描页面中的二维码');
        }
      } catch (err: any) {
        // 页面可能已跳转，再次检测登录状态
        try {
          const url = page.url();
          if (url.includes(config.successIndicator)) {
            onStatus('logged_in', '登录成功，正在获取账号信息...');
            await this.handleLoginSuccess(session);
            return;
          }
        } catch { /* page closed */ }
      }

      // 继续轮询（1秒间隔）
      session.timer = setTimeout(poll, 1000);
    };

    await poll();
  }

  /**
   * 截取二维码区域
   */
  private async captureQrCode(page: Page, selector: string): Promise<string | null> {
    try {
      // 尝试多个选择器
      const selectors = selector.split(',').map(s => s.trim());
      for (const sel of selectors) {
        const element = await page.$(sel);
        if (element) {
          const screenshot = await element.screenshot({ type: 'png' });
          return `data:image/png;base64,${screenshot.toString('base64')}`;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 登录成功后提取账号信息
   */
  private async handleLoginSuccess(session: ScanSession) {
    const { page, platform, userId, onSuccess, onError } = session;
    if (!page) return;

    try {
      // 等待页面完全加载
      await page.waitForTimeout(3000);

      // 提取 Cookie
      const context = session.context!;
      const cookies = await context.cookies();
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      // 提取用户信息（各平台不同）
      const userInfo = await this.extractUserInfo(page, platform);

      // 加密 Cookie 并保存到数据库
      const account = await this.saveAccount({
        platform,
        userId,
        cookies: cookieString,
        ...userInfo,
      });

      onSuccess(account);
      this.logger.log(`扫码绑定成功: ${platform} - ${userInfo.nickname || 'unknown'}`);
    } catch (error: any) {
      this.logger.error(`提取账号信息失败: ${error.message}`);
      onError('登录成功但提取信息失败: ' + error.message);
    } finally {
      this.cleanup(session);
    }
  }

  /**
   * 从页面提取用户信息
   */
  private async extractUserInfo(page: Page, platform: string): Promise<{
    nickname: string;
    avatar: string;
    platformUserId: string;
  }> {
    let nickname = '';
    let avatar = '';
    let platformUserId = '';

    try {
      switch (platform) {
        case 'DOUYIN':
          await page.goto('https://creator.douyin.com/creator-micro/home', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          nickname = await page.$eval('[class*="nickname"], [class*="user-name"]', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img', el => (el as HTMLImageElement).src || '').catch(() => '');
          // 从 URL 或页面提取 UID
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/passport_uid=(\d+)/);
            return match ? match[1] : '';
          });
          break;

        case 'XIAOHONGSHU':
          await page.goto('https://creator.xiaohongshu.com/home', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          nickname = await page.$eval('[class*="name"], [class*="nickname"]', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/customer_id=([^;]+)/);
            return match ? match[1] : '';
          });
          break;

        case 'KUAISHOU':
          await page.goto('https://cp.kuaishou.com/profile', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          nickname = await page.$eval('[class*="nick"], [class*="name"]', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img, [class*="head"] img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/userId=([^;]+)/);
            return match ? match[1] : '';
          });
          break;

        case 'BILIBILI':
          await page.goto('https://member.bilibili.com/platform/home', { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(2000);
          nickname = await page.$eval('[class*="nickname"], .h-name', el => el.textContent?.trim() || '').catch(() => '');
          avatar = await page.$eval('[class*="avatar"] img, .h-avatar img', el => (el as HTMLImageElement).src || '').catch(() => '');
          platformUserId = await page.evaluate(() => {
            const match = document.cookie.match(/DedeUserID=(\d+)/);
            return match ? match[1] : '';
          });
          break;

        case 'WEIBO':
          await page.goto('https://weibo.com/', { waitUntil: 'domcontentloaded' });
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
      this.logger.warn(`提取用户信息部分失败 (${platform}): ${err.message}`);
    }

    return {
      nickname: nickname || `${platform}用户`,
      avatar,
      platformUserId: platformUserId || `scan_${Date.now()}`,
    };
  }

  /**
   * 保存账号到数据库
   */
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
      throw new Error('COOKIE_ENCRYPTION_KEY 未配置');
    }

    const encryptedCookies = encryptCookie(params.cookies, encryptionKey);

    // upsert — 如果该平台用户已存在则更新 Cookie
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

    // 返回脱敏数据
    const { cookies, ...rest } = account;
    return { ...rest, hasCookies: true };
  }

  /**
   * 取消扫码会话
   */
  cancelSession(clientId: string) {
    const session = this.sessions.get(clientId);
    if (session) {
      session.cancelled = true;
      this.cleanup(session);
    }
  }

  /**
   * 清理会话资源
   */
  private async cleanup(session: ScanSession) {
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = undefined;
    }
    if (session.context) {
      try {
        await session.context.close();
      } catch { /* ignore */ }
      session.context = undefined;
    }
    session.page = undefined;
    this.sessions.delete(session.clientId);
  }
}
