import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { FingerprintGenerator } from './fingerprint-generator';

/**
 * 浏览器实例池（带指纹隔离）
 * 每个账号使用独立的浏览器指纹，防止平台检测多账号关联
 */
@Injectable()
export class BrowserPool implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPool.name);
  private browser: Browser | null = null;
  private launching = false;
  private fingerprintGen = new FingerprintGenerator();

  /**
   * 获取浏览器实例（懒加载，单例）
   */
  async getBrowser(retries = 0): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    if (this.launching) {
      if (retries >= 10) {
        throw new Error('浏览器启动超时，请稍后重试');
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.getBrowser(retries + 1);
    }

    this.launching = true;
    try {
      this.logger.log('启动 Chromium 浏览器...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
        ],
      });
      this.logger.log('Chromium 启动成功');
      return this.browser;
    } finally {
      this.launching = false;
    }
  }

  /**
   * 创建带指纹隔离的浏览器上下文
   * 每次调用生成独立指纹（或使用指定 accountId 的固定指纹）
   */
  async createContext(options?: {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
    accountId?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
  }): Promise<BrowserContext> {
    const browser = await this.getBrowser();

    // 为每个账号生成稳定的指纹（同一 accountId 每次得到相同指纹）
    const fingerprint = options?.accountId
      ? this.fingerprintGen.getStableFingerprint(options.accountId)
      : this.fingerprintGen.generateRandom();

    const context = await browser.newContext({
      userAgent: options?.userAgent || fingerprint.userAgent,
      viewport: options?.viewport || fingerprint.viewport,
      locale: fingerprint.locale,
      timezoneId: fingerprint.timezone,
      screen: fingerprint.screen,
      colorScheme: fingerprint.colorScheme,
      deviceScaleFactor: fingerprint.deviceScaleFactor,
    });

    // 注入反检测脚本
    await context.addInitScript(() => {
      // 隐藏 webdriver 标志
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // 伪装 plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // 伪装 languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en-US', 'en'],
      });

      // 覆盖 chrome.runtime（防止检测无头浏览器）
      (window as any).chrome = { runtime: {} };

      // 伪装 permissions
      const originalQuery = window.navigator.permissions?.query;
      if (originalQuery) {
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: 'denied' } as PermissionStatus)
            : originalQuery(parameters);
      }
    });

    // 注入 Canvas/WebGL 指纹噪声
    await context.addInitScript(`
      // Canvas fingerprint noise
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] ^= ${fingerprint.canvasNoise};
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.apply(this, arguments);
      };

      // WebGL vendor/renderer spoofing
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return '${fingerprint.webglVendor}';
        if (parameter === 37446) return '${fingerprint.webglRenderer}';
        return getParameter.apply(this, arguments);
      };
    `);

    if (options?.cookies?.length) {
      await context.addCookies(options.cookies);
    }

    return context;
  }

  /**
   * 创建新页面
   */
  async createPage(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);
    return page;
  }

  /**
   * 模块销毁时关闭浏览器
   */
  async onModuleDestroy() {
    if (this.browser) {
      this.logger.log('关闭 Chromium 浏览器...');
      await this.browser.close();
      this.browser = null;
    }
  }
}
