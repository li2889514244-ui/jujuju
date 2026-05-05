/**
 * 抖音发布适配器
 *
 * 实现抖音创作者平台的内容发布流程
 */

import { Page } from 'playwright';
import { IPlatformAdapter, IPlatformSelectors, IPublishResult } from './IPlatformAdapter';
import { IPublishContent } from '../../models/PublishTask';
import { logger } from '../../utils/logger';
import { randomizeTimings, humanType } from '../../utils/AntiDetection';

export class DouyinAdapter implements IPlatformAdapter {
  readonly platform = 'douyin';
  readonly platformName = '抖音';

  getSelectors(): IPlatformSelectors {
    return {
      loginCheck: '.avatar-img, .user-info, [data-e2e="user-info"]',
      loginUrl: 'https://creator.douyin.com/creator-micro/content/upload',
      publishUrl: 'https://creator.douyin.com/creator-micro/content/upload',
      titleInput: '[data-e2e="video-title"] input, .title-input input',
      contentInput: '[data-e2e="video-desc"] textarea, .desc-textarea textarea, [contenteditable="true"]',
      videoUpload: 'input[type="file"][accept*="video"], .upload-btn input[type="file"]',
      imageUpload: 'input[type="file"][accept*="image"]',
      coverUpload: '.cover-upload, .select-cover-btn',
      hashtagInput: '.tag-input input, [data-e2e="hashtag-input"]',
      publishButton: '[data-e2e="publish-btn"], .publish-btn button, button:has-text("发布")',
      successIndicator: '.publish-success, [data-e2e="publish-success"], .success-toast',
    };
  }

  async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      const selectors = this.getSelectors();
      await page.goto(selectors.loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomizeTimings(2000, 3000);

      // 检查是否在登录页
      const url = page.url();
      if (url.includes('login') || url.includes('passport')) {
        return false;
      }

      // 检查登录态元素
      const loginElement = await page.$(selectors.loginCheck);
      return loginElement !== null;
    } catch (err) {
      logger.error(`抖音登录状态检查失败: ${(err as Error).message}`);
      return false;
    }
  }

  async login(page: Page, credentials?: { username: string; password: string }): Promise<boolean> {
    if (!credentials) {
      logger.warn('抖音登录需要凭据（或使用 Cookie 登录）');
      return false;
    }

    try {
      await page.goto('https://creator.douyin.com/', { waitUntil: 'domcontentloaded' });
      await randomizeTimings(1000, 2000);

      // 切换到账号密码登录
      const switchBtn = await page.$('text=账号密码登录');
      if (switchBtn) {
        await switchBtn.click();
        await randomizeTimings(500, 1000);
      }

      // 输入用户名
      await humanType(page, 'input[name="username"], input[placeholder*="账号"]', credentials.username);
      await randomizeTimings(300, 600);

      // 输入密码
      await humanType(page, 'input[name="password"], input[placeholder*="密码"]', credentials.password);
      await randomizeTimings(500, 1000);

      // 点击登录
      const loginBtn = await page.$('button:has-text("登录"), .login-btn');
      if (loginBtn) {
        await loginBtn.click();
        await randomizeTimings(3000, 5000);
      }

      // 验证登录成功
      return this.checkLoginStatus(page);
    } catch (err) {
      logger.error(`抖音登录失败: ${(err as Error).message}`);
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
      // 1. 导航到发布页面
      await this.navigateToPublish(page);

      // 2. 检查登录状态
      const isLoggedIn = await this.checkLoginStatus(page);
      if (!isLoggedIn) {
        return {
          success: false,
          error: '未登录，请先导入 Cookie 或手动登录',
          duration: Date.now() - startTime,
        };
      }

      // 3. 上传视频/图片
      if (content.videoPath) {
        const fileInput = await page.$(this.getSelectors().videoUpload || 'input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(content.videoPath);
          logger.info('视频上传中...');
          // 等待上传完成
          await page.waitForSelector('.upload-success, .video-preview', { timeout: 120000 });
          await randomizeTimings(2000, 4000);
        }
      }

      if (content.imagePaths && content.imagePaths.length > 0) {
        const fileInput = await page.$(this.getSelectors().imageUpload || 'input[type="file"][accept*="image"]');
        if (fileInput) {
          await fileInput.setInputFiles(content.imagePaths);
          logger.info('图片上传中...');
          await randomizeTimings(3000, 6000);
        }
      }

      // 4. 填写标题
      if (content.title) {
        const titleInput = await page.$(this.getSelectors().titleInput || '');
        if (titleInput) {
          await titleInput.click();
          await randomizeTimings(200, 400);
          await titleInput.fill(content.title);
          await randomizeTimings(300, 600);
        }
      }

      // 5. 填写描述
      if (content.description) {
        const descInput = await page.$(this.getSelectors().contentInput);
        if (descInput) {
          await descInput.click();
          await randomizeTimings(200, 400);
          await descInput.fill(content.description);
          await randomizeTimings(300, 600);
        }
      }

      // 6. 添加话题标签
      if (content.hashtags && content.hashtags.length > 0) {
        for (const tag of content.hashtags) {
          const hashtagInput = await page.$(this.getSelectors().hashtagInput || '');
          if (hashtagInput) {
            await hashtagInput.click();
            await randomizeTimings(200, 400);
            await hashtagInput.fill(`#${tag}`);
            await randomizeTimings(500, 1000);
            // 按回车确认
            await hashtagInput.press('Enter');
            await randomizeTimings(300, 600);
          }
        }
      }

      // 7. 点击发布
      await randomizeTimings(1000, 2000);
      const publishBtn = await page.$(this.getSelectors().publishButton);
      if (publishBtn) {
        await publishBtn.click();
        logger.info('点击发布按钮');
      }

      // 8. 等待发布成功
      try {
        await page.waitForSelector(this.getSelectors().successIndicator, { timeout: 30000 });
        logger.info('抖音发布成功');
      } catch {
        // 可能跳转到了作品管理页
        await randomizeTimings(3000, 5000);
      }

      // 9. 提取发布结果
      const currentUrl = page.url();

      return {
        success: true,
        publishedUrl: currentUrl,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      const error = (err as Error).message;
      logger.error(`抖音发布失败: ${error}`);
      return {
        success: false,
        error,
        duration: Date.now() - startTime,
      };
    }
  }
}
