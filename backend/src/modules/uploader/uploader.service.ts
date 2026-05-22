import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Platform } from '../../common/prisma-enums';
import { BaseUploader, PublishTask, PublishResult, LoginStatus } from './base-uploader';
import { CookieManager } from './cookie-manager';
import { ContentService } from '../content/content.service';

/**
 * Uploader 宸ュ巶 + 璋冨害鍣?
 * 鏍规嵁骞冲彴鍒嗗彂浠诲姟鍒板搴旂殑 Uploader 瀹炵幇
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
   * 娉ㄥ唽骞冲彴 Uploader锛堢敱鍚勫钩鍙版ā鍧楀湪鍒濆鍖栨椂璋冪敤锛?
   */
  registerUploader(uploader: BaseUploader): void {
    this.uploaders.set(uploader.platform, uploader);
    this.logger.log(`Uploader 宸叉敞鍐? ${uploader.name} (${uploader.platform})`);
  }

  /**
   * 鑾峰彇宸叉敞鍐岀殑骞冲彴鍒楄〃
   */
  getRegisteredPlatforms(): Platform[] {
    return Array.from(this.uploaders.keys());
  }

  /**
   * 鎵ц鍙戝竷浠诲姟
   */
  async executePublish(task: PublishTask): Promise<PublishResult> {
    const uploader = this.uploaders.get(task.platform);
    if (!uploader) {
      const result: PublishResult = {
        success: false,
        errorMsg: `骞冲彴 ${task.platform} 鏆傛湭鏀寔鑷姩鍙戝竷`,
      };
      await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
      return result;
    }

    // 1. 鍔犺浇 Cookie
    const cookies = await this.cookieManager.loadCookies(task.accountId);
    if (!cookies) {
      const result: PublishResult = {
        success: false,
        errorMsg: '',
      };
      await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
      return result;
    }

    // 2. 妫€鏌ョ櫥褰曟€?
    const loginStatus = await uploader.checkLogin(cookies);
    if (loginStatus === LoginStatus.EXPIRED) {
      const result: PublishResult = {
        success: false,
        errorMsg: '',
      };
      await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
      return result;
    }

    // 3. 鎵ц鍙戝竷
    try {
      this.logger.log(`寮€濮嬪彂甯? ${task.contentId} 鈫?${task.platform}`);
      const result = await uploader.publish(task, cookies);

      if (result.success) {
        await this.contentService.updatePublishStatus(task.contentId, 'PUBLISHED', result.platformUrl);
        this.logger.log(`鍙戝竷鎴愬姛: ${task.contentId} 鈫?${result.platformUrl}`);
      } else {
        await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
        this.logger.warn(`鍙戝竷澶辫触: ${task.contentId} 鈥?${result.errorMsg}`);
      }

      // 4. 淇濆瓨鏈€鏂?Cookie锛堝彂甯冭繃绋嬩腑鍙兘鍒锋柊浜嗭級
      // 鐢卞悇骞冲彴 uploader 鍐呴儴澶勭悊

      return result;
    } catch (error: any) {
      const errorMsg = error.message || '[garbled]'
      await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, errorMsg);
      this.logger.error(`鍙戝竷寮傚父: ${task.contentId}`, error.stack);
      return { success: false, errorMsg };
    }
  }

  /**
   * 鎵归噺鍙戝竷锛堜竴閿垎鍙戣皟鐢級
   */
  async executeBatchPublish(tasks: PublishTask[]): Promise<PublishResult[]> {
    // 涓茶鎵ц锛岄伩鍏嶅悓鏃舵墦寮€澶娴忚鍣ㄩ〉闈?
    const results: PublishResult[] = [];
    for (const task of tasks) {
      const result = await this.executePublish(task);
      results.push(result);
      // 姣忔鍙戝竷闂撮殧 2-5 绉掞紝妯℃嫙浜哄伐鎿嶄綔鑺傚
      await this.delay(2000 + Math.random() * 3000);
    }
    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
