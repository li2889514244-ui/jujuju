/**
 * 小红书发布适配器
 *
 * 实现小红书创作者平台的内容发布流程
 */

import { Page } from 'playwright';
import { IPlatformAdapter, IPlatformSelectors, IPublishResult } from './IPlatformAdapter';
import { IPublishContent } from '../../models/PublishTask';
import { logger } from '../../utils/logger';
import { randomizeTimings } from '../../utils/AntiDetection';

export class XiaohongshuAdapter implements IPlatformAdapter {
  readonly platform = 'xiaohongshu';
  readonly platformName = '小红书';

  getSelectors(): IPlatformSelectors {
    return {
      loginCheck: '.user-info, .avatar, .nickname',
      loginUrl: 'https://creator.xiaohongshu.com/publish/publish',
      publishUrl: 'https://creator.xiaohongshu.com/publish/publish',
      titleInput: '#title, input[placeholder*="标题"], .title-input input',
      contentInput: '#content-textarea, textarea[placeholder*="正文"], .ql-editor, [contenteditable="true"]',
      imageUpload: 'input[type="file"][accept*="image"], .upload-image input[type="file"]',
      videoUpload: 'input[type="file"][accept*="video"]',
      coverUpload: '.cover-upload, .select-cover',
      hashtagInput: '.topic-input input, #hash-tag-input',
      publishButton: 'button:has-text("发布"), .publish-btn, .submit-btn',
      successIndicator: '.publish-success, .success-toast, text=发布成功',
      locationSelector: '.location-selector, .poi-search input',
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
      logger.error(`小红书登录状态检查失败: ${(err as Error).message}`);
      return false;
    }
  }

  async login(page: Page, credentials?: { username: string; password: string }): Promise<boolean> {
    if (!credentials) {
      logger.warn('小红书登录需要凭据（或使用 Cookie 登录）');
      return false;
    }

    try {
      await page.goto('https://creator.xiaohongshu.com/login', { waitUntil: 'domcontentloaded' });
      await randomizeTimings(1000, 2000);

      // 切换到账号密码登录
      const switchBtn = await page.$('text=密码登录, text=账号密码登录');
      if (switchBtn) {
        await switchBtn.click();
        await randomizeTimings(500, 1000);
      }

      // 输入手机号
      const phoneInput = await page.$('input[placeholder*="手机号"], input[name="phone"]');
      if (phoneInput) {
        await phoneInput.fill(credentials.username);
        await randomizeTimings(300, 600);
      }

      // 输入密码
      const pwdInput = await page.$('input[type="password"], input[placeholder*="密码"]');
      if (pwdInput) {
        await pwdInput.fill(credentials.password);
        await randomizeTimings(500, 1000);
      }

      // 点击登录
      const loginBtn = await page.$('button:has-text("登录"), .login-btn');
      if (loginBtn) {
        await loginBtn.click();
        await randomizeTimings(3000, 5000);
      }

      return this.checkLoginStatus(page);
    } catch (err) {
      logger.error(`小红书登录失败: ${(err as Error).message}`);
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

      // 上传图片（小红书主要以图文为主）
      if (content.imagePaths && content.imagePaths.length > 0) {
        const fileInput = await page.$(this.getSelectors().imageUpload || 'input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(content.imagePaths);
          logger.info('小红书图片上传中...');
          await page.waitForSelector('.upload-success, .image-preview, .upload-item', { timeout: 60000 });
          await randomizeTimings(2000, 4000);
        }
      }

      // 上传视频
      if (content.videoPath) {
        const fileInput = await page.$(this.getSelectors().videoUpload || 'input[type="file"][accept*="video"]');
        if (fileInput) {
          await fileInput.setInputFiles(content.videoPath);
          logger.info('小红书视频上传中...');
          await randomizeTimings(5000, 10000);
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

      // 填写正文
      if (content.description) {
        const contentInput = await page.$(this.getSelectors().contentInput);
        if (contentInput) {
          await contentInput.click();
          await contentInput.fill(content.description);
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
      logger.error(`小红书发布失败: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message, duration: Date.now() - startTime };
    }
  }
}
