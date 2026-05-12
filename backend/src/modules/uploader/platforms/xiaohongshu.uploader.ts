import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Platform } from '@prisma/client';
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
 * 小红书创作者平台 Uploader
 * 通过 Playwright 自动化操作 https://creator.xiaohongshu.com 完成发布
 */
@Injectable()
export class XiaohongshuUploader extends BaseUploader implements OnModuleInit {
  private readonly logger = new Logger(XiaohongshuUploader.name);

  readonly platform = Platform.XIAOHONGSHU;
  readonly name = '小红书';

  private readonly CREATOR_URL = 'https://creator.xiaohongshu.com';
  private readonly PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish';

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

      const hasUser = await page.locator('.user-name, .creator-info, .avatar').first().isVisible().catch(() => false);
      return hasUser ? LoginStatus.VALID : LoginStatus.UNKNOWN;
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
      // 等待扫码登录完成
      await page.waitForURL('**/creator.xiaohongshu.com/**', { timeout: 120000 });

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
        return { success: false, errorMsg: '登录态已过期' };
      }

      // 判断发布类型：有视频发视频，否则发图文
      const isVideo = task.mediaUrls.some((u) => /\.(mp4|mov|avi)/i.test(u));

      if (isVideo) {
        // 切换到视频 tab
        const videoTab = page.locator(':text("发布视频"), [class*="video-tab"]').first();
        if (await videoTab.isVisible().catch(() => false)) {
          await videoTab.click();
          await page.waitForTimeout(1000);
        }
      }

      // 上传文件
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ timeout: 10000 });

      const mediaUrl = task.mediaUrls[0];
      const ext = isVideo ? 'mp4' : 'jpg';
      const tempPath = `/tmp/xhs_upload_${Date.now()}.${ext}`;
      await this.downloadFile(mediaUrl, tempPath);
      await fileInput.setInputFiles(tempPath);

      // 等待上传完成
      await this.waitForUpload(page);

      // 填写标题
      const titleInput = page.locator('[placeholder*="标题"], .title-input, #title').first();
      if (await titleInput.isVisible().catch(() => false)) {
        await titleInput.click();
        await titleInput.fill(task.title || '');
      }

      // 填写正文
      const contentInput = page.locator('.ql-editor, [placeholder*="正文"], .content-input').first();
      if (await contentInput.isVisible().catch(() => false)) {
        await contentInput.click();
        await page.keyboard.type(task.content.slice(0, 1000));
      }

      // 添加话题
      for (const tag of task.tags.slice(0, 5)) {
        await page.keyboard.type(`#${tag} `);
        await page.waitForTimeout(500);
      }

      // 点击发布
      await page.waitForTimeout(2000);
      const publishBtn = page.locator('button:has-text("发布"), [class*="publish-btn"]').first();
      await publishBtn.click();
      await page.waitForTimeout(5000);

      const success = await page.locator(':text("发布成功"), :text("已发布")').first().isVisible().catch(() => false);

      if (success) {
        const newCookies = await context.cookies();
        await this.cookieManager.saveCookies(task.accountId, newCookies.map((c) => ({
          name: c.name, value: c.value, domain: c.domain, path: c.path,
          expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
          sameSite: c.sameSite as StoredCookie['sameSite'],
        })));
        return { success: true };
      }

      const errorText = await page.locator('[class*="error"], .toast').first().textContent().catch(() => null);
      return { success: false, errorMsg: errorText || '发布结果未知' };
    } catch (error: any) {
      return { success: false, errorMsg: error.message };
    } finally {
      await this.cleanup('xhs');
      await context.close();
    }
  }

  private async waitForUpload(page: any): Promise<void> {
    const maxWait = 180000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const done = await page.locator(':text("上传成功"), :text("上传完成"), [class*="success"]').first().isVisible().catch(() => false);
      if (done) return;
      await page.waitForTimeout(3000);
    }
    throw new Error('上传超时');
  }

  private async downloadFile(url: string, dest: string): Promise<void> {
    const { safeDownload } = require('../utils/safe-file-ops');
    await safeDownload(url, dest);
  }

  private async cleanup(prefix: string): Promise<void> {
    const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
    safeCleanupTempFiles(`${prefix}_upload_`);
  }
}
