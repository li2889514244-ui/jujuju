/**
 * 快手发布适配器
 *
 * 实现快手创作者平台的内容发布流程
 */

import { Page } from 'playwright';
import { IPlatformAdapter, IPlatformSelectors, IPublishResult } from './IPlatformAdapter';
import { IPublishContent } from '../../models/PublishTask';
import { logger } from '../../utils/logger';
import { randomizeTimings, humanType } from '../../utils/AntiDetection';

export class KuaishouAdapter implements IPlatformAdapter {
  readonly platform = 'kuaishou';
  readonly platformName = '快手';

  getSelectors(): IPlatformSelectors {
    return {
      loginCheck: '.user-name, .avatar, .profile-info',
      loginUrl: 'https://cp.kuaishou.com/article/publish/video',
      publishUrl: 'https://cp.kuaishou.com/article/publish/video',
      titleInput: '.title-input input, input[placeholder*="标题"]',
      contentInput: '.desc-textarea textarea, textarea[placeholder*="描述"], [contenteditable="true"]',
      videoUpload: 'input[type="file"][accept*="video"], .upload-input input[type="file"]',
      imageUpload: 'input[type="file"][accept*="image"]',
      coverUpload: '.cover-select, .change-cover-btn',
      hashtagInput: '.topic-input input, .tag-input input',
      publishButton: '.publish-btn button, button:has-text("发布"), .submit-btn',
      successIndicator: '.publish-success, .success-tip, .toast-success',
    };
  }

  async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      const selectors = this.getSelectors();
      await page.goto(selectors.loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomizeTimings(2000, 3000);

      const url = page.url();
      if (url.includes('login') || url.includes('passport')) {
        return false;
      }

      const loginElement = await page.$(selectors.loginCheck);
      return loginElement !== null;
    } catch (err) {
      logger.error(`快手登录状态检查失败: ${(err as Error).message}`);
      return false;
    }
  }

  async login(page: Page, credentials?: { username: string; password: string }): Promise<boolean> {
    if (!credentials) {
      logger.warn('快手登录需要凭据（或使用 Cookie 登录）');
      return false;
    }

    try {
      await page.goto('https://cp.kuaishou.com/', { waitUntil: 'domcontentloaded' });
      await randomizeTimings(1000, 2000);

      // 输入手机号
      await humanType(page, 'input[placeholder*="手机号"], input[name="username"]', credentials.username);
      await randomizeTimings(300, 600);

      // 输入密码
      await humanType(page, 'input[placeholder*="密码"], input[name="password"], input[type="password"]', credentials.password);
      await randomizeTimings(500, 1000);

      // 点击登录
      const loginBtn = await page.$('button:has-text("登录"), .login-btn, .submit-btn');
      if (loginBtn) {
        await loginBtn.click();
        await randomizeTimings(3000, 5000);
      }

      return this.checkLoginStatus(page);
    } catch (err) {
      logger.error(`快手登录失败: ${(err as Error).message}`);
      return false;
    }
  }

  async navigateToPublish(page: Page): Promise<void> {
    const selectors = this.getSelectors();
    await page.goto(selectors.publishUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomizeTimings(2000, 4000);
  }

  async publish(page: Page, content: IPublishContent): Promise<IPublishResult> {
    const startTime = Date.now();

    try {
      await this.navigateToPublish(page);

      const isLoggedIn = await this.checkLoginStatus(page);
      if (!isLoggedIn) {
        return { success: false, error: '未登录', duration: Date.now() - startTime };
      }

      // 上传视频
      if (content.videoPath) {
        const fileInput = await page.$(this.getSelectors().videoUpload || 'input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(content.videoPath);
          logger.info('快手视频上传中...');
          await page.waitForSelector('.upload-success, .video-preview, .upload-complete', { timeout: 120000 });
          await randomizeTimings(2000, 4000);
        }
      }

      // 填写标题
      if (content.title) {
        const titleInput = await page.$(this.getSelectors().titleInput || '');
        if (titleInput) {
          await titleInput.click();
          await titleInput.fill(content.title);
          await randomizeTimings(300, 600);
        }
      }

      // 填写描述
      if (content.description) {
        const descInput = await page.$(this.getSelectors().contentInput);
        if (descInput) {
          await descInput.click();
          await descInput.fill(content.description);
          await randomizeTimings(300, 600);
        }
      }

      // 添加话题
      if (content.hashtags && content.hashtags.length > 0) {
        for (const tag of content.hashtags) {
          const hashtagInput = await page.$(this.getSelectors().hashtagInput || '');
          if (hashtagInput) {
            await hashtagInput.click();
            await hashtagInput.fill(`#${tag}`);
            await hashtagInput.press('Enter');
            await randomizeTimings(300, 600);
          }
        }
      }

      // 发布
      await randomizeTimings(1000, 2000);
      const publishBtn = await page.$(this.getSelectors().publishButton);
      if (publishBtn) {
        await publishBtn.click();
      }

      await randomizeTimings(3000, 5000);

      return {
        success: true,
        publishedUrl: page.url(),
        duration: Date.now() - startTime,
      };
    } catch (err) {
      logger.error(`快手发布失败: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message, duration: Date.now() - startTime };
    }
  }
}
