import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { FingerprintGenerator } from './fingerprint-generator';

@Injectable()
export class BrowserPool implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPool.name);
  private browser: Browser | null = null;
  private launching = false;
  private fingerprintGen = new FingerprintGenerator();

  async getBrowser(retries = 0): Promise<Browser> {
    if (this.browser?.isConnected()) return this.browser;
    if (this.launching) {
      if (retries >= 10) throw new Error('Browser launch timeout');
      await new Promise((r) => setTimeout(r, 1000));
      return this.getBrowser(retries + 1);
    }
    this.launching = true;
    try {
      this.logger.log('Launching Chromium...');
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-infobars',
          '--window-size=1280,800',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
        ],
      });
      this.logger.log('Chromium launched');
      return this.browser;
    } finally {
      this.launching = false;
    }
  }

  async createContext(options?: {
    cookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number; httpOnly?: boolean; secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None' }>;
    accountId?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
  }): Promise<BrowserContext> {
    const browser = await this.getBrowser();
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
      extraHTTPHeaders: {
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
    });

    // Comprehensive stealth injection
    await context.addInitScript(() => {
      // ---- Navigator properties ----
      const od = Object.defineProperty;
      od(navigator, 'webdriver', { get: () => undefined });
      od(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      od(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
      od(navigator, 'language', { get: () => 'zh-CN' });
      od(navigator, 'platform', { get: () => 'Win32' });
      od(navigator, 'hardwareConcurrency', { get: () => 8 });
      od(navigator as any, 'deviceMemory', { get: () => 8 });
      od(navigator, 'maxTouchPoints', { get: () => 0 });
      od(navigator, 'vendor', { get: () => 'Google Inc.' });
      od(navigator, 'productSub', { get: () => '20030107' });
      od(navigator, 'appVersion', { get: () => navigator.appVersion.replace('Headless', '') });

      // ---- Chrome runtime ----
      (window as any).chrome = {
        runtime: { onConnect: { addListener: () => {} }, onMessage: { addListener: () => {} } },
        loadTimes: () => ({}),
        csi: () => ({}),
        app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
      };

      // ---- Permissions ----
      const origQuery = (navigator.permissions as any)?.query;
      if (origQuery) {
        (navigator.permissions as any).query = (p: any) =>
          p.name === 'notifications' ? Promise.resolve({ state: 'denied' } as PermissionStatus) : origQuery(p);
      }

      // ---- Connection ----
      od(navigator, 'connection', { get: () => ({ effectiveType: '4g', rtt: 50, downlink: 10, saveData: false }) });

      // ---- Media devices ----
      if (navigator.mediaDevices?.enumerateDevices) {
        const origEnum = navigator.mediaDevices.enumerateDevices;
        (navigator.mediaDevices as any).enumerateDevices = () => origEnum.call(navigator.mediaDevices);
      }

      // ---- Intl ----
      const origDateTime = Intl.DateTimeFormat;
      (Intl as any).DateTimeFormat = function (...args: any[]) {
        return new origDateTime(...args);
      };
    });

    // Canvas/WebGL fingerprint noise
    await context.addInitScript(`
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(t) {
        const ctx = this.getContext('2d');
        if (ctx) {
          const d = ctx.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < d.data.length; i += 4) d.data[i] ^= ${fingerprint.canvasNoise};
          ctx.putImageData(d, 0, 0);
        }
        return origToDataURL.apply(this, arguments);
      };
      const gp = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(p) {
        if (p === 37445) return '${fingerprint.webglVendor}';
        if (p === 37446) return '${fingerprint.webglRenderer}';
        return gp.apply(this, arguments);
      };
    `);

    if (options?.cookies?.length) {
      await context.addCookies(options.cookies);
    }

    return context;
  }

  async createPage(context: BrowserContext): Promise<Page> {
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(60000);
    return page;
  }

  async onModuleDestroy() {
    if (this.browser) {
      this.logger.log('Closing Chromium...');
      await this.browser.close();
      this.browser = null;
    }
  }
}
