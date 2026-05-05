/**
 * 视频号发布适配器
 *
 * 实现微信视频号的内容发布流程
 */

import { Page } from 'playwright';
import { IPlatformAdapter, IPlatformSelectors, IPublishResult } from './IPlatformAdapter';
import { IPublishContent } from '../../models/PublishTask';
import { logger } from '../../utils/logger';
import { randomizeTimings } from '../../utils/AntiDetection';

export class ShipinhaoAdapter implements IPlatformAdapter {
  readonly platform = 'shipinhao';
  readonly platformName = '视频号';

  getSelectors(): IPlatformSelectors {
    return {
      loginCheck: '.user-avatar, .account-info, .user-name',
      loginUrl: 'https://channels.weixin.qq.com/platform/post/create',
      publishUrl: 'https://channels.weixin.qq.com/platform/post/create',
      titleInput: '.title-input input, input[placeholder*="标题"]',
      contentInput: '.desc-input textarea, textarea[placeholder*="描述"], [contenteditable="true"]',
      videoUpload: 'input[type="file"][accept*="video"], .upload-video input[type="file"]',
      imageUpload: 'input[type="file"][accept*="image"]',
      coverUpload: '.cover-upload-btn, .select-cover',
      hashtagInput: '.topic-input input, .hashtag-input input',
      publishButton: 'button:has-text("发表"), button:has-text("发布"), .publish-btn',
      successIndicator: '.publish-success, text=发布成功, text=发表成功',
    };
  }

  async checkLoginStatus(page: Page): Promise<boolean> {
    try {
      const selectors = this.getSelectors();
      await page.goto(selectors.loginUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await randomizeTimings(2000, 4000);

      const url = page.url();
      if (url.includes('login') || url.includes('qrcode')) {
        return false;
      }

      const loginElement = await page.$(selectors.loginCheck);
      return loginElement !== null;
    } catch (err) {
      logger.error(`视频号登录状态检查失败: ${(err as Error).message}`);
      return false;
    }
  }

  async login(page: Page): Promise<boolean> {
    // 视频号通常通过微信扫码登录，需要手动操作
    logger.warn('视频号登录需要微信扫码，请在浏览器中手动完成登录');
    try {
      await page.goto('https://channels.weixin.qq.com/', { waitUntil: 'domcontentloaded' });

      // 等待用户扫码（最多等 120 秒）
      await page.waitForSelector('.user-avatar, .account-info', { timeout: 120000 });
      return true;
    } catch {
      logger.error('视频号登录超时');
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
          logger.info('视频号视频上传中...');
          await page.waitForSelector('.upload-success, .video-preview, .upload-complete', { timeout: 180000 });
          await randomizeTimings(3000, 6000);
        }
      }

      // 填写描述
      if (content.description) {
        const contentInput = await page.$(this.getSelectors().contentInput);
        if (contentInput) {
          await contentInput.click();
          await contentInput.fill(content.description);
          await randomizeTimings(300, 600);
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
      logger.error(`视频号发布失败: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message, duration: Date.now() - startTime };
    }
  }
}
