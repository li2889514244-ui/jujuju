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
var UploaderService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploaderService = void 0;
const common_1 = require("@nestjs/common");
const base_uploader_1 = require("./base-uploader");
const cookie_manager_1 = require("./cookie-manager");
const content_service_1 = require("../content/content.service");
let UploaderService = UploaderService_1 = class UploaderService {
    constructor(cookieManager, contentService) {
        this.cookieManager = cookieManager;
        this.contentService = contentService;
        this.logger = new common_1.Logger(UploaderService_1.name);
        this.uploaders = new Map();
    }
    registerUploader(uploader) {
        this.uploaders.set(uploader.platform, uploader);
        this.logger.log(`Uploader 已注册: ${uploader.name} (${uploader.platform})`);
    }
    getRegisteredPlatforms() {
        return Array.from(this.uploaders.keys());
    }
    async executePublish(task) {
        const uploader = this.uploaders.get(task.platform);
        if (!uploader) {
            const result = {
                success: false,
                errorMsg: `平台 ${task.platform} 暂未支持自动发布`,
            };
            await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
            return result;
        }
        const cookies = await this.cookieManager.loadCookies(task.accountId);
        if (!cookies) {
            const result = {
                success: false,
                errorMsg: 'Cookie 加载失败',
            };
            await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
            return result;
        }
        const loginStatus = await uploader.checkLogin(cookies);
        if (loginStatus === base_uploader_1.LoginStatus.EXPIRED) {
            const result = {
                success: false,
                errorMsg: 'Cookie 已过期',
            };
            await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
            return result;
        }
        try {
            this.logger.log(`开始发布: ${task.contentId} → ${task.platform}`);
            const result = await uploader.publish(task, cookies);
            if (result.success) {
                await this.contentService.updatePublishStatus(task.contentId, 'PUBLISHED', result.platformUrl);
                this.logger.log(`发布成功: ${task.contentId} → ${result.platformUrl}`);
            }
            else {
                await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, result.errorMsg);
                this.logger.warn(`发布失败: ${task.contentId} — ${result.errorMsg}`);
            }
            return result;
        }
        catch (error) {
            const errorMsg = error.message || '发布异常';
            await this.contentService.updatePublishStatus(task.contentId, 'FAILED', undefined, errorMsg);
            this.logger.error(`发布异常: ${task.contentId}`, error.stack);
            return { success: false, errorMsg };
        }
    }
    async executeBatchPublish(tasks) {
        const results = [];
        for (const task of tasks) {
            const result = await this.executePublish(task);
            results.push(result);
            await this.delay(2000 + Math.random() * 3000);
        }
        return results;
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.UploaderService = UploaderService;
exports.UploaderService = UploaderService = UploaderService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [cookie_manager_1.CookieManager,
        content_service_1.ContentService])
], UploaderService);
//# sourceMappingURL=uploader.service.js.map