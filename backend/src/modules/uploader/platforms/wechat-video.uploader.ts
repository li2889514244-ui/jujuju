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
 * 寰俊瑙嗛鍙?Uploader
 * 閫氳繃 Playwright 鑷姩鍖栨搷浣滆棰戝彿鍒涗綔鑰呭钩鍙板畬鎴愬彂甯?
 * https://channels.weixin.qq.com/platform
 */
@Injectable()
export class WechatVideoUploader extends BaseUploader implements OnModuleInit {
  private readonly logger = new Logger(WechatVideoUploader.name);

  readonly platform = Platform.WECHAT_VIDEO;
  readonly name = '[garbled]'

  private readonly CREATOR_URL = 'https://channels.weixin.qq.com/platform';
  private readonly UPLOAD_URL = 'https://channels.weixin.qq.com/platform/post/create';

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

  /**
   * 妫€鏌ョ櫥褰曟€?
   */
  async checkLogin(cookies: StoredCookie[]): Promise<LoginStatus> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(this.CREATOR_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      const url = page.url();
      // 瑙嗛鍙锋湭鐧诲綍浼氭樉绀烘壂鐮侀〉闈?
      if (url.includes('login') || url.includes('passport')) {
        return LoginStatus.EXPIRED;
      }

      // 妫€鏌ユ槸鍚︽湁鎵爜鎻愮ず
      const hasQrCode = await page.locator('.login__type__container__scan, .qr-code, [class*="scan"]').first().isVisible().catch(() => false);
      if (hasQrCode) {
        return LoginStatus.EXPIRED;
      }

      // 妫€鏌ユ槸鍚︽湁鐢ㄦ埛淇℃伅
      const hasUserInfo = await page.locator('.finder-nickname, .account-name, [class*="user-info"]').first().isVisible().catch(() => false);
      return hasUserInfo ? LoginStatus.VALID : LoginStatus.UNKNOWN;
    } catch (e) {
      this.logger.warn('[garbled]', e);
      return LoginStatus.UNKNOWN;
    } finally {
      await context.close();
    }
  }

  /**
   * 鐧诲綍娴佺▼锛堝井淇℃壂鐮侊級
   */
  async login(accountId: string): Promise<StoredCookie[]> {
    const context = await this.browserPool.createContext();
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(this.CREATOR_URL, { waitUntil: 'networkidle' });

      // 绛夊緟鐢ㄦ埛鎵爜瀹屾垚锛堟渶澶?120 绉掞級
      // 鐧诲綍鎴愬姛鍚?URL 浼氬彉涓哄垱浣滆€呬富椤?
      await page.waitForURL('**/platform/home**', { timeout: 120000 });

      const cookies = await context.cookies();
      const storedCookies: StoredCookie[] = cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite as StoredCookie['sameSite'],
      }));

      await this.cookieManager.saveCookies(accountId, storedCookies);
      this.logger.log(`瑙嗛鍙风櫥褰曟垚鍔? accountId=${accountId}`);

      return storedCookies;
    } finally {
      await context.close();
    }
  }

  /**
   * 鍙戝竷瑙嗛鍒拌棰戝彿
   */
  async publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      // 1. 杩涘叆鍙戝竷椤甸潰
      await page.goto(this.UPLOAD_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // 妫€鏌ョ櫥褰曟€?
      if (page.url().includes('login') || await page.locator('[class*="scan"]').first().isVisible().catch(() => false)) {
        return { success: false, errorMsg: '' };
      }

      // 2. 涓婁紶瑙嗛
      if (!task.mediaUrls.length) {
        return { success: false, errorMsg: '' };
      }

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ timeout: 10000 });

      const videoUrl = task.mediaUrls[0];
      const tempPath = `/tmp/wechat_video_upload_${Date.now()}.mp4`;
      await this.downloadFile(videoUrl, tempPath);
      await fileInput.setInputFiles(tempPath);

      // 3. 绛夊緟涓婁紶瀹屾垚
      await this.waitForUploadComplete(page);

      // 4. 濉啓鎻忚堪
      const descEditor = page.locator('.input-editor, [contenteditable="true"], .ql-editor').first();
      await descEditor.waitFor({ timeout: 10000 });
      await descEditor.click();

      // 杈撳叆鎻忚堪鏂囨湰
      const description = task.content.slice(0, 1000);
      await page.keyboard.type(description);

      // 5. 娣诲姞璇濋
      if (task.tags.length > 0) {
        for (const tag of task.tags.slice(0, 5)) {
          await page.keyboard.type(`#${tag}`);
          await page.waitForTimeout(800);
          // 绛夊緟璇濋鑱旀兂鍑虹幇骞堕€夋嫨
          const suggestion = page.locator(`.topic-item:has-text("${tag}"), .mention-item`).first();
          if (await suggestion.isVisible().catch(() => false)) {
            await suggestion.click();
          } else {
            await page.keyboard.press('Space');
          }
          await page.waitForTimeout(500);
        }
      }

      // 6. 鐐瑰嚮鍙戝竷
      await page.waitForTimeout(2000);
      const publishBtn = page.locator('').first();
      await publishBtn.waitFor({ timeout: 10000 });
      await publishBtn.click();

      // 7. 绛夊緟鍙戝竷缁撴灉
      await page.waitForTimeout(5000);

      const success = await page.locator('').first().isVisible().catch(() => false);

      if (success) {
        // 淇濆瓨鏈€鏂?Cookie
        const newCookies = await context.cookies();
        await this.cookieManager.saveCookies(task.accountId, newCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite as StoredCookie['sameSite'],
        })));

        return { success: true };
      }

      const errorText = await page.locator('.error, .toast-error, [class*="error"]').first().textContent().catch(() => null);
      return {
        success: false,
        errorMsg: errorText || '[garbled]',
      };
    } catch (error: any) {
      this.logger.error('[garbled]', error.stack);
      return { success: false, errorMsg: error.message };
    } finally {
      await this.cleanup();
      await context.close();
    }
  }

  private async waitForUploadComplete(page: any): Promise<void> {
    const maxWait = 300000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const complete = await page.locator('').first().isVisible().catch(() => false);
      if (complete) {
        await page.waitForTimeout(2000);
        return;
      }
      await page.waitForTimeout(3000);
    }

    throw new Error('[garbled]');
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    const { safeDownload } = require('../utils/safe-file-ops');
    await safeDownload(url, destPath);
  }

  private async cleanup(): Promise<void> {
    const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
    safeCleanupTempFiles('wechat_video_upload_');
  }
}
