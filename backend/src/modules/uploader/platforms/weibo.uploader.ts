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
 * 寰崥鍒涗綔鑰呭钩鍙?Uploader
 * https://weibo.com 鍙戝竷鎺ュ彛
 */
@Injectable()
export class WeiboUploader extends BaseUploader implements OnModuleInit {
  private readonly logger = new Logger(WeiboUploader.name);

  readonly platform = Platform.WEIBO;
  readonly name = '寰崥';

  private readonly CREATOR_URL = 'https://weibo.com';
  private readonly PUBLISH_URL = 'https://weibo.com/upload/channel';

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
      await page.goto('https://passport.weibo.com/sso/signin', { waitUntil: 'networkidle' });
      // 绛夊緟鎵爜鎴栬处瀵嗙櫥褰曞畬鎴?
      await page.waitForURL('**/weibo.com/**', { timeout: 120000 });

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
      // 寰崥鍙戝竷鍒嗕袱绉嶏細鏈夎棰戣蛋瑙嗛鍙戝竷锛岀函鏂囧瓧/鍥剧墖璧板井鍗氬彂甯冩
      const isVideo = task.mediaUrls.some((u) => /\.(mp4|mov|avi)/i.test(u));

      if (isVideo) {
        return await this.publishVideo(page, task, context);
      } else {
        return await this.publishPost(page, task, context);
      }
    } catch (error: any) {
      return { success: false, errorMsg: error.message };
    } finally {
      const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
      safeCleanupTempFiles('weibo_upload_');
      await context.close();
    }
  }

  private async publishVideo(page: any, task: PublishTask, context: any): Promise<PublishResult> {
    await page.goto(this.PUBLISH_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    if (page.url().includes('login') || page.url().includes('passport')) {
      return { success: false, errorMsg: '鐧诲綍鎬佸凡杩囨湡' };
    }

    // 涓婁紶瑙嗛
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.waitFor({ timeout: 10000 });

    const tempPath = `/tmp/weibo_upload_${Date.now()}.mp4`;
    await this.downloadFile(task.mediaUrls[0], tempPath);
    await fileInput.setInputFiles(tempPath);

    // 绛夊緟涓婁紶
    await this.waitForUpload(page);

    // 濉啓鏍囬
    const titleInput = page.locator('[placeholder*="鏍囬"], .title-input, input[name="title"]').first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.click();
      await titleInput.fill(task.title.slice(0, 40));
    }

    // 濉啓鎻忚堪
    const descInput = page.locator('[placeholder*="鎻忚堪"], .desc-input, textarea').first();
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.click();
      await page.keyboard.type(task.content.slice(0, 500));
    }

    // 娣诲姞璇濋
    for (const tag of task.tags.slice(0, 3)) {
      await page.keyboard.type(`#${tag}# `);
      await page.waitForTimeout(300);
    }

    // 鍙戝竷
    await page.waitForTimeout(2000);
    const publishBtn = page.locator('button:has-text("鍙戝竷"), [class*="publish"]').first();
    await publishBtn.click();
    await page.waitForTimeout(5000);

    const success = await page.locator(':text("鍙戝竷鎴愬姛"), :text("宸插彂甯?)').first().isVisible().catch(() => false);
    if (success) {
      await this.saveCookies(task.accountId, context);
      return { success: true };
    }
    return { success: false, errorMsg: '鍙戝竷缁撴灉鏈煡' };
  }

  private async publishPost(page: any, task: PublishTask, context: any): Promise<PublishResult> {
    await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // 鎵惧埌鍙戝竷妗?
    const editor = page.locator('[placeholder*="鏈変粈涔堟柊椴滀簨"], .Form_input, textarea[node-type="textEl"]').first();
    if (await editor.isVisible().catch(() => false)) {
      await editor.click();
      await page.waitForTimeout(500);

      // 缁勫悎鍐呭锛氭爣棰?+ 姝ｆ枃 + 璇濋
      let text = task.title ? `銆?{task.title}銆慭n` : '';
      text += task.content.slice(0, 500);
      for (const tag of task.tags.slice(0, 3)) {
        text += ` #${tag}#`;
      }
      await page.keyboard.type(text);
    }

    // 涓婁紶鍥剧墖锛堝鏋滄湁锛?
    if (task.mediaUrls.length > 0) {
      const imgInput = page.locator('input[type="file"][accept*="image"]').first();
      if (await imgInput.isVisible().catch(() => false)) {
        for (const url of task.mediaUrls.slice(0, 9)) {
          const tempPath = `/tmp/weibo_upload_${Date.now()}.jpg`;
          await this.downloadFile(url, tempPath);
          await imgInput.setInputFiles(tempPath);
          await page.waitForTimeout(1000);
        }
      }
    }

    // 鍙戦€?
    await page.waitForTimeout(1000);
    const sendBtn = page.locator('button:has-text("鍙戦€?), [node-type="submit"]').first();
    await sendBtn.click();
    await page.waitForTimeout(3000);

    await this.saveCookies(task.accountId, context);
    return { success: true };
  }

  private async saveCookies(accountId: string, context: any): Promise<void> {
    const cookies = await context.cookies();
    await this.cookieManager.saveCookies(accountId, cookies.map((c: any) => ({
      name: c.name, value: c.value, domain: c.domain, path: c.path,
      expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
      sameSite: c.sameSite as StoredCookie['sameSite'],
    })));
  }

  private async waitForUpload(page: any): Promise<void> {
    const maxWait = 300000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const done = await page.locator(':text("涓婁紶瀹屾垚"), :text("涓婁紶鎴愬姛")').first().isVisible().catch(() => false);
      if (done) return;
      await page.waitForTimeout(3000);
    }
    throw new Error('涓婁紶瓒呮椂');
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const { safeDownload } = require('../utils/safe-file-ops');
    await safeDownload(url, dest);
  }
}
