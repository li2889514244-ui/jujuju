import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Platform } from '../../../common/prisma-enums';
import {
  BaseUploader,
  PublishTask,
  PublishResult,
  StoredCookie,
  LoginStatus,
} from '../base-uploader';
import { BrowserPool } from '../browser-pool';
import { CookieManager } from '../cookie-manager';
import { UploaderService } from '../uploader.service';

/**
 * 蹇墜鍒涗綔鑰呭钩鍙?Uploader
 * https://cp.kuaishou.com
 */
@Injectable()
export class KuaishouUploader extends BaseUploader implements OnModuleInit {
  private readonly logger = new Logger(KuaishouUploader.name);

  readonly platform = Platform.KUAISHOU;
  readonly name = '';

  private readonly CREATOR_URL = 'https://cp.kuaishou.com';
  private readonly PUBLISH_URL = 'https://cp.kuaishou.com/article/publish/video';

  constructor(
    private browserPool: BrowserPool,
    private cookieManager: CookieManager,
    private uploaderService: UploaderService,
  ) {
    super();
  }

  onModuleInit() {
    this.uploaderService.registerUploader(this);
  }

  getCreatorUrl(): string {
    return this.CREATOR_URL;
  }

  async checkLogin(cookies: StoredCookie[]): Promise<LoginStatus> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(this.CREATOR_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const url = page.url();
      if (url.includes('login') || url.includes('passport')) {
        return LoginStatus.EXPIRED;
      }
      return LoginStatus.VALID;
    } catch {
      return LoginStatus.UNKNOWN;
    } finally {
      await context.close();
    }
  }

  async login(accountId: string): Promise<StoredCookie[]> {
    const context = await this.browserPool.createContext();
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(`${this.CREATOR_URL}/login`, { waitUntil: 'networkidle' });
      await page.waitForURL('**/cp.kuaishou.com/**', { timeout: 120000 });

      const cookies = await context.cookies();
      const storedCookies: StoredCookie[] = cookies.map((c) => ({
        name: c.name, value: c.value, domain: c.domain, path: c.path,
        expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
        sameSite: c.sameSite as StoredCookie['sameSite'],
      }));

      await this.cookieManager.saveCookies(accountId, storedCookies);
      return storedCookies;
    } finally {
      await context.close();
    }
  }

  async publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(this.PUBLISH_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      if (page.url().includes('login')) {
        return { success: false, errorMsg: '' };
      }

      // 涓婁紶瑙嗛
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ timeout: 10000 });

      const tempPath = `/tmp/ks_upload_${Date.now()}.mp4`;
      await this.downloadFile(task.mediaUrls[0], tempPath);
      await fileInput.setInputFiles(tempPath);

      // 绛夊緟涓婁紶
      await this.waitForUpload(page);

      // 濉啓鎻忚堪锛堝揩鎵嬭棰戝彂甯冧富瑕佹槸鎻忚堪锛屾病鏈夊崟鐙爣棰橈級
      const descInput = page.locator('').first();
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.click();
        const text = task.title ? `${task.title}\n${task.content}` : task.content;
        await page.keyboard.type(text.slice(0, 500));
      }

      // 娣诲姞璇濋
      for (const tag of task.tags.slice(0, 5)) {
        await page.keyboard.type(`#${tag} `);
        await page.waitForTimeout(500);
      }

      // 鍙戝竷
      await page.waitForTimeout(2000);
      const publishBtn = page.locator('').first();
      await publishBtn.click();
      await page.waitForTimeout(5000);

      const success = await page.locator('').first().isVisible().catch(() => false);

      if (success) {
        const newCookies = await context.cookies();
        await this.cookieManager.saveCookies(task.accountId, newCookies.map((c) => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path,
          expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
          sameSite: c.sameSite as StoredCookie['sameSite'],
        })));
        return { success: true };
      }

      return { success: false, errorMsg: '[garbled]'};
    } catch (error: any) {
      return { success: false, errorMsg: error.message };
    } finally {
      const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
      safeCleanupTempFiles('ks_upload_');
      await context.close();
    }
  }

  private async waitForUpload(page: any): Promise<void> {
    const maxWait = 300000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const done = await page.locator('').first().isVisible().catch(() => false);
      if (done) return;
      await page.waitForTimeout(3000);
    }
    throw new Error('');
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const { safeDownload } = require('../utils/safe-file-ops');
    await safeDownload(url, dest);
  }
}
