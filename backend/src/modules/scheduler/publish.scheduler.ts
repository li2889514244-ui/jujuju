import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ContentService } from '../content/content.service';
import { UploaderService } from '../uploader/uploader.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PublishTask } from '../uploader/base-uploader';

/**
 * 定时发布调度器
 * 每分钟扫描一次 SCHEDULED 状态且 publishAt <= now 的内容，触发自动发布
 */
@Injectable()
export class PublishScheduler {
  private readonly logger = new Logger(PublishScheduler.name);
  private isProcessing = false;

  constructor(
    private contentService: ContentService,
    private uploaderService: UploaderService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * 每分钟执行一次，扫描到期的定时发布任务
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledPublish() {
    if (this.isProcessing) {
      this.logger.debug('上一轮定时发布仍在执行，跳过本次');
      return;
    }

    this.isProcessing = true;

    try {
      const posts = await this.contentService.getScheduledPosts();

      if (posts.length === 0) {
        return;
      }

      this.logger.log(`发现 ${posts.length} 条待发布内容`);

      for (const post of posts) {
        try {
          // 原子抢占：只有状态仍为 SCHEDULED 时才更新为 PUBLISHING（多实例安全）
          const claimed = await this.contentService.claimForPublish(post.id);
          if (!claimed) {
            this.logger.debug(`跳过已被其他实例抢占的内容: ${post.id}`);
            continue;
          }

          const task: PublishTask = {
            contentId: post.id,
            accountId: post.accountId,
            platform: post.account.platform,
            title: post.title || '',
            content: post.content || '',
            mediaUrls: JSON.parse(post.mediaUrls || '[]'),
            tags: JSON.parse(post.tags || '[]'),
          };

          await this.uploaderService.executePublish(task);

          // 发布成功通知
          await this.notificationsService.create({
            userId: post.account.userId,
            type: 'PUBLISH_SUCCESS',
            title: `定时发布成功: ${post.title || '无标题'}`,
            content: `账号「${post.account.nickname}」内容已成功发布`,
            metadata: { postId: post.id, platform: post.account.platform },
          });

          // 发布间隔 3-6 秒，避免频率过高
          await this.delay(3000 + Math.random() * 3000);
        } catch (error: any) {
          this.logger.error(`定时发布失败: ${post.id}`, error.stack);
          try {
            await this.contentService.updatePublishStatus(
              post.id,
              'FAILED',
              undefined,
              error.message || '定时发布执行异常',
            );
          } catch (updateErr: any) {
            this.logger.error(`更新发布状态失败: ${post.id}`, updateErr.message);
          }

          // 发布失败通知
          try {
            await this.notificationsService.create({
              userId: post.account.userId,
              type: 'PUBLISH_FAILED',
              title: `定时发布失败: ${post.title || '无标题'}`,
              content: error.message || '定时发布执行异常',
              metadata: { postId: post.id, platform: post.account.platform },
            });
          } catch (notifErr: any) {
            this.logger.error(`发送通知失败: ${post.id}`, notifErr.message);
          }
        }
      }

      this.logger.log(`本轮定时发布完成，处理 ${posts.length} 条`);
    } catch (error: any) {
      this.logger.error('定时发布调度器异常', error.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
