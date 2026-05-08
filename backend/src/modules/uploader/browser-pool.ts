import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

/**
 * 浏览器实例池
 * 管理 Playwright Chromium 实例的生命周期
 */
@Injectable()
export class BrowserPool implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPool.name);
  private browser: Browser | null = null;
  private launching = false;

  /**
   * 获取浏览器实例（懒加载，单例）
   */
  async getBrowser(): Promise<Browser> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    if (this.launching) {
      // 等待其他调用者完成启动
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.getBrowser();
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
        ],
      });
      this.logger.log('Chromium 启动成功');
      return this.browser;
    } finally {
      this.launching = false;
    }
  }

  /**
   * 创建一个新的浏览器上下文（隔离的 Cookie/Storage）
   * 可选注入已有 Cookie
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
    userAgent?: string;
    viewport?: { width: number; height: number };
  }): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: options?.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: options?.viewport || { width: 1280, height: 720 },
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

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
    // 设置默认超时
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
