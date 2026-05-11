import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { FingerprintGenerator } from './fingerprint-generator';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class BrowserPool implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPool.name);
  private browser: Browser | null = null;
  private launching = false;
  private fingerprintGen = new FingerprintGenerator();
  private stealthScript: string | null = null;

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
          '--disable-infobars',
          '--window-size=1280,800',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-field-trial-config',
          '--disable-hang-monitor',
          '--disable-ipc-flooding-protection',
          '--disable-popup-blocking',
          '--disable-prompt-on-repost',
          '--disable-sync',
          '--enable-features=NetworkService,NetworkServiceInProcess',
        ],
      });
      this.logger.log('Chromium launched');
      return this.browser;
    } finally {
      this.launching = false;
    }
  }

  private loadStealthScript(): string {
    if (this.stealthScript) return this.stealthScript;
    const scriptPath = path.join(__dirname, 'stealth.min.js');
    if (fs.existsSync(scriptPath)) {
      this.stealthScript = fs.readFileSync(scriptPath, 'utf-8');
      this.logger.log(`Loaded stealth.min.js (${this.stealthScript.length} bytes)`);
    } else {
      this.logger.warn('stealth.min.js not found, using basic stealth');
      this.stealthScript = '';
    }
    return this.stealthScript;
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
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      },
    });

    // Inject puppeteer-extra stealth script (industry standard anti-detection)
    const stealth = this.loadStealthScript();
    if (stealth) {
      await context.addInitScript(stealth);
      this.logger.log('Stealth script injected');
    }

    // Additional Canvas/WebGL fingerprint noise (layer on top of stealth)
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
