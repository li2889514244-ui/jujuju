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
 * 抖音创作者服务平台 Uploader
 * 通过 Playwright 自动化操作 https://creator.douyin.com 完成视频发布
 */
@Injectable()
export class DouyinUploader extends BaseUploader implements OnModuleInit {
  private readonly logger = new Logger(DouyinUploader.name);

  readonly platform = Platform.DOUYIN;
  readonly name = '抖音';

  private readonly CREATOR_URL = 'https://creator.douyin.com';
  private readonly UPLOAD_URL = 'https://creator.douyin.com/creator-micro/content/upload';

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
   * 检查 Cookie 是否有效
   * 访问创作者中心，看是否被重定向到登录页
   */
  async checkLogin(cookies: StoredCookie[]): Promise<LoginStatus> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(this.CREATOR_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);

      const url = page.url();
      // 如果被重定向到登录页，说明 Cookie 过期
      if (url.includes('login') || url.includes('passport')) {
        return LoginStatus.EXPIRED;
      }

      // 检查页面是否有用户头像/昵称元素
      const hasUserInfo = await page.locator('.avatar, .user-info, .creator-avatar').first().isVisible().catch(() => false);
      return hasUserInfo ? LoginStatus.VALID : LoginStatus.UNKNOWN;
    } catch (e) {
      this.logger.warn('抖音登录态检查失败', e);
      return LoginStatus.UNKNOWN;
    } finally {
      await context.close();
    }
  }

  /**
   * 登录流程
   * 抖音需要扫码登录，这里打开登录页等待用户扫码
   * 实际使用时需要配合前端展示二维码
   */
  async login(accountId: string): Promise<StoredCookie[]> {
    const context = await this.browserPool.createContext();
    const page = await this.browserPool.createPage(context);

    try {
      await page.goto(`${this.CREATOR_URL}/login`, { waitUntil: 'networkidle' });

      // 等待用户扫码完成（最多等 120 秒）
      await page.waitForURL('**/creator-micro/**', { timeout: 120000 });

      // 登录成功，提取 Cookie
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

      // 保存到数据库
      await this.cookieManager.saveCookies(accountId, storedCookies);
      this.logger.log(`抖音登录成功: accountId=${accountId}`);

      return storedCookies;
    } finally {
      await context.close();
    }
  }

  /**
   * 发布视频到抖音
   */
  async publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult> {
    const context = await this.browserPool.createContext({ cookies });
    const page = await this.browserPool.createPage(context);

    try {
      // 1. 进入发布页面
      await page.goto(this.UPLOAD_URL, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);

      // 检查是否需要重新登录
      if (page.url().includes('login') || page.url().includes('passport')) {
        return { success: false, errorMsg: '登录态已过期，请重新登录' };
      }

      // 2. 上传视频文件
      if (!task.mediaUrls.length) {
        return { success: false, errorMsg: '没有可上传的视频文件' };
      }

      // 找到文件上传 input
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.waitFor({ timeout: 10000 });

      // 下载视频到临时文件再上传
      const videoUrl = task.mediaUrls[0];
      const tempPath = `/tmp/douyin_upload_${Date.now()}.mp4`;
      await this.downloadFile(videoUrl, tempPath);
      await fileInput.setInputFiles(tempPath);

      // 3. 等待上传完成
      await this.waitForUploadComplete(page);

      // 4. 填写标题/描述
      const titleInput = page.locator('.title-input, [data-testid="title"], .ql-editor').first();
      await titleInput.waitFor({ timeout: 10000 });
      await titleInput.click();
      await titleInput.fill('');
      await page.keyboard.type(task.title || task.content.slice(0, 50));

      // 5. 填写描述（如果有单独的描述框）
      const descInput = page.locator('.desc-input, [placeholder*="描述"], .description-editor').first();
      if (await descInput.isVisible().catch(() => false)) {
        await descInput.click();
        await page.keyboard.type(task.content.slice(0, 500));
      }

      // 6. 添加话题标签
      if (task.tags.length > 0) {
        for (const tag of task.tags.slice(0, 5)) {
          await page.keyboard.type(`#${tag} `);
          await page.waitForTimeout(500);
        }
      }

      // 7. 设置封面（如果有）
      if (task.coverUrl) {
        // 尝试找到封面设置按钮
        const coverBtn = page.locator('[class*="cover"], button:has-text("设置封面")').first();
        if (await coverBtn.isVisible().catch(() => false)) {
          // 封面设置逻辑较复杂，暂时跳过
          this.logger.log('封面设置暂未实现，使用默认封面');
        }
      }

      // 8. 点击发布按钮
      await page.waitForTimeout(2000);
      const publishBtn = page.locator('button:has-text("发布"), [class*="publish-btn"]').first();
      await publishBtn.waitFor({ timeout: 10000 });
      await publishBtn.click();

      // 9. 等待发布完成
      await page.waitForTimeout(5000);

      // 检查是否发布成功（看是否跳转到内容管理页或出现成功提示）
      const successIndicator = await page.locator(':text("发布成功"), :text("已发布"), .success-toast').first().isVisible().catch(() => false);
      const currentUrl = page.url();

      if (successIndicator || currentUrl.includes('content/manage')) {
        // 尝试获取作品链接
        const platformUrl = await this.extractPostUrl(page);

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

        return {
          success: true,
          platformUrl: platformUrl || undefined,
        };
      }

      // 检查是否有错误提示
      const errorText = await page.locator('.error-msg, .toast-error, [class*="error"]').first().textContent().catch(() => null);
      return {
        success: false,
        errorMsg: errorText || '发布结果未知，请手动检查',
      };
    } catch (error: any) {
      this.logger.error('抖音发布异常', error.stack);
      return { success: false, errorMsg: error.message };
    } finally {
      // 清理临时文件
      await this.cleanup();
      await context.close();
    }
  }

  /**
   * 等待视频上传完成
   */
  private async waitForUploadComplete(page: any): Promise<void> {
    // 等待进度条消失或出现"上传完成"提示
    const maxWait = 300000; // 最多等 5 分钟
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const progress = await page.locator('[class*="progress"], .upload-progress').first().isVisible().catch(() => false);
      const complete = await page.locator(':text("上传完成"), :text("Upload complete"), [class*="upload-success"]').first().isVisible().catch(() => false);

      if (complete || !progress) {
        await page.waitForTimeout(2000);
        return;
      }
      await page.waitForTimeout(3000);
    }

    throw new Error('视频上传超时（5分钟）');
  }

  /**
   * 提取发布后的作品 URL
   */
  private async extractPostUrl(page: any): Promise<string | null> {
    try {
      // 尝试从页面中找到作品链接
      const link = await page.locator('a[href*="douyin.com/video"]').first().getAttribute('href').catch(() => null);
      return link;
    } catch {
      return null;
    }
  }

  /**
   * 下载文件到本地临时目录
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const { safeDownload } = require('../utils/safe-file-ops');
    await safeDownload(url, destPath);
  }

  /**
   * 清理临时文件
   */
  private async cleanup(): Promise<void> {
    const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
    safeCleanupTempFiles('douyin_upload_');
  }
}
