import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Platform } from '@prisma/client';
import { BaseUploader, PublishTask, PublishResult, LoginStatus } from './base-uploader';
import { CookieManager } from './cookie-manager';
import { ContentService } from '../content/content.service';

/**
 * Uploader 工厂 + 调度器
 * 根据平台分发任务到对应的 Uploader 实现
 */
@Injectable()
export class UploaderService {
  private readonly logger = new Logger(UploaderService.name);
  private readonly uploaders = new Map<Platform, BaseUploader>();

  constructor(
    private cookieManager: CookieManager,
    private contentService: ContentService,
  ) {}

  /**
   * 注册平台 Uploader（由各平台模块在初始化时调用）
   */
  registerUploader(uploader: BaseUploader): void {
    this.uploaders.set(uploader.platform, uploader);
    this.logger.log(`Uploader 已注册: ${uploader.name} (${uploader.platform})`);
  }

  /**
   * 获取已注册的平台列表
   */
  getRegisteredPlatforms(): Platform[] {
    return Array.from(this.uploaders.keys());
  }

  /**
   * 执行发布任务
   */
  async executePublish(task: PublishTask): Promise<PublishResult> {
    const uploader = this.uploaders.get(task.platform);
    if (!uploader) {
      const result: PublishResult = {
        success: false,
        errorMsg: `平台 ${task.platform} 暂未支持自动发布`,
      };
      await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
      return result;
    }

    // 1. 加载 Cookie
    const cookies = await this.cookieManager.loadCookies(task.accountId);
    if (!cookies) {
      const result: PublishResult = {
        success: false,
        errorMsg: '未找到登录态，请先登录平台账号',
      };
      await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
      return result;
    }

    // 2. 检查登录态
    const loginStatus = await uploader.checkLogin(cookies);
    if (loginStatus === LoginStatus.EXPIRED) {
      const result: PublishResult = {
        success: false,
        errorMsg: '登录态已过期，请重新登录',
      };
      await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
      return result;
    }

    // 3. 执行发布
    try {
      this.logger.log(`开始发布: ${task.contentId} → ${task.platform}`);
      const result = await uploader.publish(task, cookies);

      if (result.success) {
        await this.contentService.updatePublishStatus(task.contentId, 'PUBLISHED', result.platformUrl);
        this.logger.log(`发布成功: ${task.contentId} → ${result.platformUrl}`);
      } else {
        await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
        this.logger.warn(`发布失败: ${task.contentId} — ${result.errorMsg}`);
      }

      // 4. 保存最新 Cookie（发布过程中可能刷新了）
      // 由各平台 uploader 内部处理

      return result;
    } catch (error: any) {
      const errorMsg = error.message || '发布过程中发生未知错误';
      await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, errorMsg);
      this.logger.error(`发布异常: ${task.contentId}`, error.stack);
      return { success: false, errorMsg };
    }
  }

  /**
   * 批量发布（一键分发调用）
   */
  async executeBatchPublish(tasks: PublishTask[]): Promise<PublishResult[]> {
    // 串行执行，避免同时打开太多浏览器页面
    const results: PublishResult[] = [];
    for (const task of tasks) {
      const result = await this.executePublish(task);
      results.push(result);
      // 每次发布间隔 2-5 秒，模拟人工操作节奏
      await this.delay(2000 + Math.random() * 3000);
    }
    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
