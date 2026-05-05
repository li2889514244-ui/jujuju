/**
 * 浏览器服务
 *
 * 管理 Playwright 浏览器实例的生命周期
 * 支持并发控制、账号隔离、反检测
 */

import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../utils/logger';
import { generateFingerprint, FingerprintConfig } from '../utils/Fingerprint';
import { applyStealthScripts } from '../utils/AntiDetection';
import { getProxy, markProxyFailed, markProxySuccess, ProxyConfig } from '../utils/ProxyManager';
import { BrowserSession, IBrowserSession, SessionStatus } from '../models/BrowserSession';

export interface BrowserServiceConfig {
  /** 默认浏览器类型 */
  defaultBrowserType: 'chromium' | 'firefox' | 'webkit';
  /** 最大并发上下文数 */
  maxContexts: number;
  /** 上下文空闲超时（毫秒） */
  idleTimeout: number;
  /** 是否启用无头模式 */
  headless: boolean;
  /** 默认视口 */
  defaultViewport: { width: number; height: number };
}

const DEFAULT_CONFIG: BrowserServiceConfig = {
  defaultBrowserType: 'chromium',
  maxContexts: parseInt(process.env.MAX_CONTEXTS || '10', 10),
  idleTimeout: parseInt(process.env.IDLE_TIMEOUT || '600000', 10), // 10 分钟
  headless: process.env.HEADLESS !== 'false',
  defaultViewport: { width: 1920, height: 1080 },
};

export class BrowserService {
  private static instance: BrowserService;

  private browser: Browser | null = null;
  private config: BrowserServiceConfig;
  private sessions: Map<string, BrowserSession> = new Map();
  private contexts: Map<string, BrowserContext> = new Map();
  private pages: Map<string, Page[]> = new Map();
  private fingerprints: Map<string, FingerprintConfig> = new Map();
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();
  private initialized = false;

  private constructor(config?: Partial<BrowserServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: Partial<BrowserServiceConfig>): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService(config);
    }
    return BrowserService.instance;
  }

  /**
   * 启动浏览器实例
   */
  async launchBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    const launcher = this.getLauncher();
    const fingerprint = generateFingerprint();

    logger.info(`正在启动 ${this.config.defaultBrowserType} 浏览器...`);

    this.browser = await launcher.launch({
      headless: this.config.headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-infobars',
        '--window-size=1920,1080',
        `--user-agent=${fingerprint.userAgent}`,
      ],
    });

    this.initialized = true;
    logger.info('浏览器启动成功');

    // 浏览器断开时自动重连
    this.browser.on('disconnected', () => {
      logger.warn('浏览器连接断开');
      this.browser = null;
      this.initialized = false;
      // 清理所有会话状态
      this.sessions.forEach((session) => {
        session.updateStatus(SessionStatus.ERROR);
        session.error = '浏览器连接断开';
      });
    });

    return this.browser;
  }

  /**
   * 创建隔离的浏览器上下文（按账号隔离）
   */
  async createContext(accountId: string): Promise<BrowserContext> {
    // 检查并发限制
    if (this.contexts.size >= this.config.maxContexts) {
      throw new Error(`已达最大并发上下文数限制: ${this.config.maxContexts}`);
    }

    // 如果该账号已有上下文，先关闭
    if (this.contexts.has(accountId)) {
      await this.closeContext(accountId);
    }

    // 确保浏览器已启动
    if (!this.browser || !this.browser.isConnected()) {
      await this.launchBrowser();
    }

    // 生成指纹
    const fingerprint = generateFingerprint();
    this.fingerprints.set(accountId, fingerprint);

    // 获取代理
    const proxy = getProxy(accountId);

    // 创建上下文选项
    const contextOptions: Record<string, unknown> = {
      userAgent: fingerprint.userAgent,
      viewport: fingerprint.viewport,
      locale: fingerprint.language,
      timezoneId: 'Asia/Shanghai',
      colorScheme: 'light',
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
    };

    // 配置代理
    if (proxy) {
      contextOptions.proxy = {
        server: proxy.server,
        username: proxy.username,
        password: proxy.password,
        bypass: proxy.bypass,
      };
      logger.info(`上下文使用代理: ${proxy.server}`);
    }

    const context = await this.browser!.newContext(contextOptions);

    // 注入反检测脚本 — 传入该账号的指纹配置以确保一致性
    context.on('page', async (page) => {
      try {
        await applyStealthScripts(page, {
          platform: fingerprint.platform,
          languages: [fingerprint.language, 'en-US', 'en'],
          hardwareConcurrency: fingerprint.hardwareConcurrency,
          deviceMemory: fingerprint.deviceMemory,
          webglVendor: fingerprint.webglVendor,
          webglRenderer: fingerprint.webglRenderer,
        });
      } catch (err) {
        logger.error('页面反检测注入失败:', err);
      }
    });

    // 创建会话记录
    const session = new BrowserSession(accountId, this.config.defaultBrowserType);
    session.updateStatus(SessionStatus.ACTIVE);
    session.fingerprint = fingerprint;
    session.proxy = proxy || undefined;

    // 存储映射
    this.sessions.set(accountId, session);
    this.contexts.set(accountId, context);
    this.pages.set(accountId, []);

    // 设置空闲超时
    this.resetIdleTimer(accountId);

    logger.info(`浏览器上下文已创建: ${accountId}`, { sessionId: session.id });

    return context;
  }

  /**
   * 获取页面实例
   */
  async getPage(accountId: string): Promise<Page> {
    const context = this.contexts.get(accountId);
    if (!context) {
      throw new Error(`账号 ${accountId} 的浏览器上下文不存在`);
    }

    // 复用现有空闲页面或创建新页面
    const accountPages = this.pages.get(accountId) || [];
    const idlePage = accountPages.find((p) => !p.isClosed());

    if (idlePage) {
      this.resetIdleTimer(accountId);
      return idlePage;
    }

    const page = await context.newPage();
    // 注入反检测脚本到新页面
    const fingerprint = this.fingerprints.get(accountId);
    if (fingerprint) {
      await applyStealthScripts(page, {
        platform: fingerprint.platform,
        languages: [fingerprint.language, 'en-US', 'en'],
        hardwareConcurrency: fingerprint.hardwareConcurrency,
        deviceMemory: fingerprint.deviceMemory,
        webglVendor: fingerprint.webglVendor,
        webglRenderer: fingerprint.webglRenderer,
      });
    }

    accountPages.push(page);
    this.pages.set(accountId, accountPages);

    // 更新会话
    const session = this.sessions.get(accountId);
    if (session) {
      session.pageCount = accountPages.filter((p) => !p.isClosed()).length;
      session.touch();
    }

    this.resetIdleTimer(accountId);

    return page;
  }

  /**
   * 关闭指定账号的上下文
   */
  async closeContext(accountId: string): Promise<void> {
    // 清除空闲定时器
    const timer = this.idleTimers.get(accountId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(accountId);
    }

    // 关闭所有页面
    const accountPages = this.pages.get(accountId) || [];
    for (const page of accountPages) {
      if (!page.isClosed()) {
        try {
          await page.close();
        } catch (err) {
          logger.debug(`关闭页面失败: ${(err as Error).message}`);
        }
      }
    }
    this.pages.delete(accountId);

    // 关闭上下文
    const context = this.contexts.get(accountId);
    if (context) {
      try {
        await context.close();
      } catch (err) {
        logger.debug(`关闭上下文失败: ${(err as Error).message}`);
      }
      this.contexts.delete(accountId);
    }

    // 更新会话状态
    const session = this.sessions.get(accountId);
    if (session) {
      session.updateStatus(SessionStatus.CLOSED);
      session.pageCount = 0;
    }
    this.sessions.delete(accountId);
    this.fingerprints.delete(accountId);

    logger.info(`浏览器上下文已关闭: ${accountId}`);
  }

  /**
   * 关闭所有实例
   */
  async closeAll(): Promise<void> {
    logger.info('正在关闭所有浏览器上下文...');

    // 关闭所有空闲定时器
    this.idleTimers.forEach((timer) => clearTimeout(timer));
    this.idleTimers.clear();

    // 关闭所有上下文
    const accountIds = Array.from(this.contexts.keys());
    await Promise.allSettled(
      accountIds.map((id) => this.closeContext(id))
    );

    // 关闭浏览器
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        logger.debug(`关闭浏览器失败: ${(err as Error).message}`);
      }
      this.browser = null;
    }

    this.sessions.clear();
    this.contexts.clear();
    this.pages.clear();
    this.fingerprints.clear();
    this.initialized = false;

    logger.info('所有浏览器实例已关闭');
  }

  /**
   * 获取所有会话状态
   */
  getSessions(): IBrowserSession[] {
    return Array.from(this.sessions.values()).map((s) => s.toJSON());
  }

  /**
   * 获取指定会话
   */
  getSession(accountId: string): IBrowserSession | null {
    return this.sessions.get(accountId)?.toJSON() ?? null;
  }

  /**
   * 获取浏览器服务状态
   */
  getStatus(): {
    initialized: boolean;
    connected: boolean;
    activeSessions: number;
    maxContexts: number;
    config: BrowserServiceConfig;
  } {
    return {
      initialized: this.initialized,
      connected: this.browser?.isConnected() ?? false,
      activeSessions: this.sessions.size,
      maxContexts: this.config.maxContexts,
      config: this.config,
    };
  }

  /**
   * 截图
   */
  async screenshot(accountId: string, options?: {
    fullPage?: boolean;
    path?: string;
  }): Promise<Buffer> {
    const accountPages = this.pages.get(accountId) || [];
    const page = accountPages.find((p) => !p.isClosed());

    if (!page) {
      throw new Error(`账号 ${accountId} 没有活跃的页面`);
    }

    return page.screenshot({
      fullPage: options?.fullPage ?? false,
      path: options?.path,
      type: 'png',
    });
  }

  /**
   * 获取指定账号的指纹配置
   */
  getFingerprint(accountId: string): FingerprintConfig | null {
    return this.fingerprints.get(accountId) ?? null;
  }

  /**
   * 获取指定账号的代理配置
   */
  getProxyConfig(accountId: string): ProxyConfig | null {
    return getProxy(accountId);
  }

  // ==================== 私有方法 ====================

  private getLauncher() {
    switch (this.config.defaultBrowserType) {
      case 'firefox':
        return firefox;
      case 'webkit':
        return webkit;
      case 'chromium':
      default:
        return chromium;
    }
  }

  private resetIdleTimer(accountId: string): void {
    const existing = this.idleTimers.get(accountId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      // 检查是否有活跃页面，如果有则重置定时器而非关闭
      const accountPages = this.pages.get(accountId) || [];
      const activePages = accountPages.filter((p) => !p.isClosed());
      if (activePages.length > 0) {
        // 仍有活跃页面，重新设置定时器
        this.resetIdleTimer(accountId);
        return;
      }

      logger.info(`上下文空闲超时，自动关闭: ${accountId}`);
      await this.closeContext(accountId);
    }, this.config.idleTimeout);

    this.idleTimers.set(accountId, timer);
  }
}
