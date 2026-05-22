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
 * B绔欏垱浣滆€呭钩鍙?Uploader
 * https://member.bilibili.com/platform/upload/video/frame
 */
@Injectable()
export class BilibiliUploader extends BaseUploader implements OnModuleInit {
  private readonly logger = new Logger(BilibiliUploader.name);

  readonly platform = Platform.BILIBILI;
  readonly name = '[garbled]'

  private readonly CREATOR_URL = 'https://member.bilibili.com';
  private readonly UPLOAD_URL = 'https://member.bilibili.com/platform/upload/video/frame';

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
      if (url.includes('passport.bilibili.com') || url.includes('login')) {
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
      await page.goto('https://passport.bilibili.com/login', { waitUntil: 'networkidle' });
      await page.waitForURL('**/member.bilibili.com/**', { timeout: 120000 });

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
      await page.goto(this.UPLOAD_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      if (page.url().includes('passport') || page.url().includes('login')) {
        return { success: false, errorMsg: '' };
      }

      // 涓婁紶瑙嗛
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ timeout: 10000 });

      const tempPath = `/tmp/bili_upload_${Date.now()}.mp4`;
      await this.downloadFile(task.mediaUrls[0], tempPath);
      await fileInput.setInputFiles(tempPath);

      // 绛夊緟涓婁紶+杞爜
      await this.waitForUpload(page);

      // 濉啓鏍囬锛圔绔欐湁鐙珛鏍囬妗嗭紝鏈€澶?0瀛楋級
      const titleInput = page.locator('').first();
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.click();
        await titleInput.fill(task.title.slice(0, 80));
      }

      // 閫夋嫨鍒嗗尯锛堥粯璁?鐢熸椿"[garbled]"
      // B绔欏繀椤婚€夊垎鍖烘墠鑳藉彂甯冿紝杩欓噷灏濊瘯閫夌涓€涓帹鑽愬垎鍖?
      const typeSelector = page.locator('.type-wrp, [class*="channel"]').first();
      if (await typeSelector.isVisible().catch(() => false)) {
        await typeSelector.click();
        await page.waitForTimeout(500);
        const firstOption = page.locator('.type-list li, .channel-item').first();
        if (await firstOption.isVisible().catch(() => false)) {
          await firstOption.click();
        }
      }

      // 濉啓绠€浠?
      const descInput = page.locator('').first();
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.click();
        await page.keyboard.type(task.content.slice(0, 250));
      }

      // 娣诲姞鏍囩
      const tagInput = page.locator('').first();
      if (await tagInput.isVisible().catch(() => false)) {
        for (const tag of task.tags.slice(0, 5)) {
          await tagInput.click();
          await tagInput.fill(tag);
          await page.keyboard.press('Enter');
          await page.waitForTimeout(300);
        }
      }

      // 鐐瑰嚮鎶曠
      await page.waitForTimeout(2000);
      const submitBtn = page.locator('').first();
      await submitBtn.click();
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

      const errorText = await page.locator('[class*="error"], .tips-wrp').first().textContent().catch(() => null);
      return { success: false, errorMsg: errorText || '' };
    } catch (error: any) {
      return { success: false, errorMsg: error.message };
    } finally {
      const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
      safeCleanupTempFiles('bili_upload_');
      await context.close();
    }
  }

  private async waitForUpload(page: any): Promise<void> {
    const maxWait = 600000; // B绔欒浆鐮佹參锛岀瓑10鍒嗛挓
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const done = await page.locator('').first().isVisible().catch(() => false);
      if (done) return;
      await page.waitForTimeout(5000);
    }
    throw new Error('');
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const { safeDownload } = require('../utils/safe-file-ops');
    await safeDownload(url, dest);
  }
}
