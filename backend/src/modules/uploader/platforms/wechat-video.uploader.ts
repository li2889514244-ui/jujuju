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
 * 微信视频号 Uploader
 * 通过 Playwright 自动化操作视频号创作者平台完成发布
 * https://channels.weixin.qq.com/platform
 */
@Injectable()
export class WechatVideoUploader extends BaseUploader implements OnModuleInit {
  private readonly logger = new Logger(WechatVideoUploader.name);

  readonly platform = Platform.WECHAT_VIDEO;
  readonly name = '视频号';

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
   * 检查登录态
   */
  async checkLogin(cookies: StoredCookie[]): Promise<LoginStatus> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(this.CREATOR_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      const url = page.url();
      // 视频号未登录会显示扫码页面
      if (url.includes('login') || url.includes('passport')) {
        return LoginStatus.EXPIRED;
      }

      // 检查是否有扫码提示
      const hasQrCode = await page.locator('.login__type__container__scan, .qr-code, [class*="scan"]').first().isVisible().catch(() => false);
      if (hasQrCode) {
        return LoginStatus.EXPIRED;
      }

      // 检查是否有用户信息
      const hasUserInfo = await page.locator('.finder-nickname, .account-name, [class*="user-info"]').first().isVisible().catch(() => false);
      return hasUserInfo ? LoginStatus.VALID : LoginStatus.UNKNOWN;
    } catch (e) {
      this.logger.warn('视频号登录态检查失败', e);
      return LoginStatus.UNKNOWN;
    } finally {
      await context.close();
    }
  }

  /**
   * 登录流程（微信扫码）
   */
  async login(accountId: string): Promise<StoredCookie[]> {
    const context = await this.browserPool.createContext();
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(this.CREATOR_URL, { waitUntil: 'networkidle' });

      // 等待用户扫码完成（最多 120 秒）
      // 登录成功后 URL 会变为创作者主页
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
      this.logger.log(`视频号登录成功: accountId=${accountId}`);

      return storedCookies;
    } finally {
      await context.close();
    }
  }

  /**
   * 发布视频到视频号
   */
  async publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      // 1. 进入发布页面
      await page.goto(this.UPLOAD_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // 检查登录态
      if (page.url().includes('login') || await page.locator('[class*="scan"]').first().isVisible().catch(() => false)) {
        return { success: false, errorMsg: '登录态已过期，请重新扫码登录' };
      }

      // 2. 上传视频
      if (!task.mediaUrls.length) {
        return { success: false, errorMsg: '没有可上传的视频文件' };
      }

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ timeout: 10000 });

      const videoUrl = task.mediaUrls[0];
      const tempPath = `/tmp/wechat_video_upload_${Date.now()}.mp4`;
      await this.downloadFile(videoUrl, tempPath);
      await fileInput.setInputFiles(tempPath);

      // 3. 等待上传完成
      await this.waitForUploadComplete(page);

      // 4. 填写描述
      const descEditor = page.locator('.input-editor, [contenteditable="true"], .ql-editor').first();
      await descEditor.waitFor({ timeout: 10000 });
      await descEditor.click();

      // 输入描述文本
      const description = task.content.slice(0, 1000);
      await page.keyboard.type(description);

      // 5. 添加话题
      if (task.tags.length > 0) {
        for (const tag of task.tags.slice(0, 5)) {
          await page.keyboard.type(`#${tag}`);
          await page.waitForTimeout(800);
          // 等待话题联想出现并选择
          const suggestion = page.locator(`.topic-item:has-text("${tag}"), .mention-item`).first();
          if (await suggestion.isVisible().catch(() => false)) {
            await suggestion.click();
          } else {
            await page.keyboard.press('Space');
          }
          await page.waitForTimeout(500);
        }
      }

      // 6. 点击发布
      await page.waitForTimeout(2000);
      const publishBtn = page.locator('button:has-text("发表"), button:has-text("发布"), .btn-publish').first();
      await publishBtn.waitFor({ timeout: 10000 });
      await publishBtn.click();

      // 7. 等待发布结果
      await page.waitForTimeout(5000);

      const success = await page.locator(':text("发表成功"), :text("发布成功"), .success').first().isVisible().catch(() => false);

      if (success) {
        // 保存最新 Cookie
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
        errorMsg: errorText || '发布结果未知，请手动检查',
      };
    } catch (error: any) {
      this.logger.error('视频号发布异常', error.stack);
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
      const complete = await page.locator(':text("上传成功"), :text("上传完成"), [class*="upload-success"]').first().isVisible().catch(() => false);
      if (complete) {
        await page.waitForTimeout(2000);
        return;
      }
      await page.waitForTimeout(3000);
    }

    throw new Error('视频上传超时（5分钟）');
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
