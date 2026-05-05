/**
 * 微博发布适配器
 *
 * 实现新浪微博的内容发布流程
 */

import { Page } from 'playwright';
import { IPlatformAdapter, IPlatformSelectors, IPublishResult } from './IPlatformAdapter';
import { IPublishContent } from '../../models/PublishTask';
import { logger } from '../../utils/logger';
import { randomizeTimings } from '../../utils/AntiDetection';

export class WeiboAdapter implements IPlatformAdapter {
  readonly platform = 'weibo';
  readonly platformName = '微博';

  getSelectors(): IPlatformSelectors {
    return {
      loginCheck: '.gn_name, .profile-info, .user-name, [node-type="loginBtn"]',
      loginUrl: 'https://weibo.com',
      publishUrl: 'https://weibo.com',
      contentInput: '.W_input_form textarea, textarea[placeholder*="分享"], .form-content textarea, [contenteditable="true"]',
      imageUpload: 'input[type="file"][accept*="image"], .pic-upload input[type="file"]',
      videoUpload: 'input[type="file"][accept*="video"]',
      hashtagInput: '.topic-input input',
      publishButton: 'a:has-text("发布"), .W_btn_a:has-text("发布"), button:has-text("发布"), .submit-btn',
      successIndicator: '.success-msg, text=发布成功, .W_layer_tips',
    };
  }

  async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomizeTimings(2000, 3000);

      const url = page.url();
      if (url.includes('passport.weibo.com') || url.includes('login.sina')) {
        return false;
      }

      const loginElement = await page.$(this.getSelectors().loginCheck);
      return loginElement !== null;
    } catch (err) {
      logger.error(`微博登录状态检查失败: ${(err as Error).message}`);
      return false;
    }
  }

  async login(page: Page, credentials?: { username: string; password: string }): Promise<boolean> {
    if (!credentials) {
      logger.warn('微博登录需要凭据（或使用 Cookie 登录）');
      return false;
    }

    try {
      await page.goto('https://passport.weibo.com/sso/signin', { waitUntil: 'domcontentloaded' });
      await randomizeTimings(1000, 2000);

      // 输入用户名
      const usernameInput = await page.$('#loginname, input[name="username"], input[placeholder*="账号"]');
      if (usernameInput) {
        await usernameInput.fill(credentials.username);
        await randomizeTimings(300, 600);
      }

      // 输入密码
      const passwordInput = await page.$('#password, input[name="password"], input[type="password"]');
      if (passwordInput) {
        await passwordInput.fill(credentials.password);
        await randomizeTimings(500, 1000);
      }

      // 点击登录
      const loginBtn = await page.$('.login_btn, input[type="submit"], button:has-text("登录")');
      if (loginBtn) {
        await loginBtn.click();
        await randomizeTimings(3000, 5000);
      }

      return this.checkLoginStatus(page);
    } catch (err) {
      logger.error(`微博登录失败: ${(err as Error).message}`);
      return false;
    }
  }

  async navigateToPublish(page: Page): Promise<void> {
    // 微博首页即可发布
    await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
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

      // 上传图片
      if (content.imagePaths && content.imagePaths.length > 0) {
        const fileInput = await page.$(this.getSelectors().imageUpload || 'input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(content.imagePaths);
          logger.info('微博图片上传中...');
          await randomizeTimings(3000, 6000);
        }
      }

      // 填写内容
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
          const contentInput = await page.$(this.getSelectors().contentInput);
          if (contentInput) {
            await contentInput.click();
            // 微博用 #话题# 格式
            await contentInput.fill(` #${tag}# `);
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
      logger.error(`微博发布失败: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message, duration: Date.now() - startTime };
    }
  }
}
