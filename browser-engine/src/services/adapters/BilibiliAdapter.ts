/**
 * B站发布适配器
 *
 * 实现哔哩哔哩创作者中心的内容发布流程
 */

import { Page } from 'playwright';
import { IPlatformAdapter, IPlatformSelectors, IPublishResult } from './IPlatformAdapter';
import { IPublishContent } from '../../models/PublishTask';
import { logger } from '../../utils/logger';
import { randomizeTimings } from '../../utils/AntiDetection';

export class BilibiliAdapter implements IPlatformAdapter {
  readonly platform = 'bilibili';
  readonly platformName = 'B站';

  getSelectors(): IPlatformSelectors {
    return {
      loginCheck: '.header-entry--avatar, .avatar-name, .mini-avatar',
      loginUrl: 'https://member.bilibili.com/platform/upload/video/frame',
      publishUrl: 'https://member.bilibili.com/platform/upload/video/frame',
      titleInput: '.input-val input, input[placeholder*="标题"], .video-title input',
      contentInput: '.desc-container textarea, textarea[placeholder*="简介"], .video-desc textarea',
      videoUpload: 'input[type="file"][accept*="video"], .bcc-upload input[type="file"]',
      imageUpload: 'input[type="file"][accept*="image"]',
      coverUpload: '.cover-upload, .cover-select-btn, .change-cover',
      hashtagInput: '.tag-input-wrp input, .topic-tag input',
      publishButton: '.submit-add, button:has-text("投稿"), .upload-btn',
      successIndicator: '.submit-success, text=投稿成功, .success-container',
    };
  }

  async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      const selectors = this.getSelectors();
      await page.goto(selectors.loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomizeTimings(2000, 3000);

      const url = page.url();
      if (url.includes('passport.bilibili.com') || url.includes('login')) {
        return false;
      }

      const loginElement = await page.$(selectors.loginCheck);
      return loginElement !== null;
    } catch (err) {
      logger.error(`B站登录状态检查失败: ${(err as Error).message}`);
      return false;
    }
  }

  async login(page: Page, credentials?: { username: string; password: string }): Promise<boolean> {
    if (!credentials) {
      logger.warn('B站登录需要凭据（或使用 Cookie 登录）');
      return false;
    }

    try {
      await page.goto('https://passport.bilibili.com/login', { waitUntil: 'domcontentloaded' });
      await randomizeTimings(1000, 2000);

      // 切换到账号密码登录
      const switchBtn = await page.$('.login-tab-r, text=密码登录');
      if (switchBtn) {
        await switchBtn.click();
        await randomizeTimings(500, 1000);
      }

      // 输入用户名
      const usernameInput = await page.$('#login-username, input[placeholder*="账号"]');
      if (usernameInput) {
        await usernameInput.fill(credentials.username);
        await randomizeTimings(300, 600);
      }

      // 输入密码
      const passwordInput = await page.$('#login-passwd, input[type="password"]');
      if (passwordInput) {
        await passwordInput.fill(credentials.password);
        await randomizeTimings(500, 1000);
      }

      // 点击登录
      const loginBtn = await page.$('.btn-login, button:has-text("登录")');
      if (loginBtn) {
        await loginBtn.click();
        await randomizeTimings(3000, 5000);
      }

      return this.checkLoginStatus(page);
    } catch (err) {
      logger.error(`B站登录失败: ${(err as Error).message}`);
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
          logger.info('B站视频上传中...');
          // B站视频上传可能较慢
          await page.waitForSelector('.upload-success, .file-item .success, .upload-complete', { timeout: 300000 });
          await randomizeTimings(3000, 6000);
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

      // 填写简介
      if (content.description) {
        const descInput = await page.$(this.getSelectors().contentInput);
        if (descInput) {
          await descInput.click();
          await descInput.fill(content.description);
          await randomizeTimings(300, 600);
        }
      }

      // 添加标签
      if (content.hashtags && content.hashtags.length > 0) {
        for (const tag of content.hashtags) {
          const tagInput = await page.$(this.getSelectors().hashtagInput || '');
          if (tagInput) {
            await tagInput.click();
            await tagInput.fill(tag);
            await tagInput.press('Enter');
            await randomizeTimings(300, 600);
          }
        }
      }

      // 点击投稿
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
      logger.error(`B站发布失败: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message, duration: Date.now() - startTime };
    }
  }
}
