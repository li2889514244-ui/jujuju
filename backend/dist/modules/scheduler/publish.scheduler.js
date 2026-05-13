"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var PublishScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublishScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const content_service_1 = require("../content/content.service");
const uploader_service_1 = require("../uploader/uploader.service");
const notifications_service_1 = require("../notifications/notifications.service");
let PublishScheduler = PublishScheduler_1 = class PublishScheduler {
    constructor(contentService, uploaderService, notificationsService) {
        this.contentService = contentService;
        this.uploaderService = uploaderService;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(PublishScheduler_1.name);
        this.isProcessing = false;
    }
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
                    const claimed = await this.contentService.claimForPublish(post.id);
                    if (!claimed) {
                        this.logger.debug(`跳过已被其他实例抢占的内容: ${post.id}`);
                        continue;
                    }
                    const task = {
                        contentId: post.id,
                        accountId: post.accountId,
                        platform: post.account.platform,
                        title: post.title || '',
                        content: post.content || '',
                        mediaUrls: post.mediaUrls || [],
                        tags: post.tags || [],
                    };
                    await this.uploaderService.executePublish(task);
                    await this.notificationsService.create({
                        userId: post.account.userId,
                        type: 'PUBLISH_SUCCESS',
                        title: `定时发布成功: ${post.title || '无标题'}`,
                        content: `账号「${post.account.nickname}」内容已成功发布`,
                        metadata: { postId: post.id, platform: post.account.platform },
                    });
                    await this.delay(3000 + Math.random() * 3000);
                }
                catch (error) {
                    this.logger.error(`定时发布失败: ${post.id}`, error.stack);
                    try {
                        await this.contentService.updatePublishStatus(post.id, 'FAILED', undefined, error.message || '定时发布执行异常');
                    }
                    catch (updateErr) {
                        this.logger.error(`更新发布状态失败: ${post.id}`, updateErr.message);
                    }
                    try {
                        await this.notificationsService.create({
                            userId: post.account.userId,
                            type: 'PUBLISH_FAILED',
                            title: `定时发布失败: ${post.title || '无标题'}`,
                            content: error.message || '定时发布执行异常',
                            metadata: { postId: post.id, platform: post.account.platform },
                        });
                    }
                    catch (notifErr) {
                        this.logger.error(`发送通知失败: ${post.id}`, notifErr.message);
                    }
                }
            }
            this.logger.log(`本轮定时发布完成，处理 ${posts.length} 条`);
        }
        catch (error) {
            this.logger.error('定时发布调度器异常', error.stack);
        }
        finally {
            this.isProcessing = false;
        }
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.PublishScheduler = PublishScheduler;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_MINUTE),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PublishScheduler.prototype, "handleScheduledPublish", null);
exports.PublishScheduler = PublishScheduler = PublishScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_service_1.ContentService,
        uploader_service_1.UploaderService,
        notifications_service_1.NotificationsService])
], PublishScheduler);
//# sourceMappingURL=publish.scheduler.js.map