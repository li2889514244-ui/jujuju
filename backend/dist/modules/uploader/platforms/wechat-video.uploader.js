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
var WechatVideoUploader_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WechatVideoUploader = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const base_uploader_1 = require("../base-uploader");
const browser_pool_1 = require("../browser-pool");
const cookie_manager_1 = require("../cookie-manager");
const uploader_service_1 = require("../uploader.service");
let WechatVideoUploader = WechatVideoUploader_1 = class WechatVideoUploader extends base_uploader_1.BaseUploader {
    constructor(browserPool, cookieManager, uploaderService) {
        super();
        this.browserPool = browserPool;
        this.cookieManager = cookieManager;
        this.uploaderService = uploaderService;
        this.logger = new common_1.Logger(WechatVideoUploader_1.name);
        this.platform = client_1.Platform.WECHAT_VIDEO;
        this.name = '视频号';
        this.CREATOR_URL = 'https://channels.weixin.qq.com/platform';
        this.UPLOAD_URL = 'https://channels.weixin.qq.com/platform/post/create';
    }
    onModuleInit() {
        this.uploaderService.registerUploader(this);
    }
    getCreatorUrl() {
        return this.CREATOR_URL;
    }
    async checkLogin(cookies) {
        const context = await this.browserPool.createContext({ cookies });
        const page = await this.browserPool.createPage(context);
        try {
            await page.goto(this.CREATOR_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            const url = page.url();
            if (url.includes('login') || url.includes('passport')) {
                return base_uploader_1.LoginStatus.EXPIRED;
            }
            const hasQrCode = await page.locator('.login__type__container__scan, .qr-code, [class*="scan"]').first().isVisible().catch(() => false);
            if (hasQrCode) {
                return base_uploader_1.LoginStatus.EXPIRED;
            }
            const hasUserInfo = await page.locator('.finder-nickname, .account-name, [class*="user-info"]').first().isVisible().catch(() => false);
            return hasUserInfo ? base_uploader_1.LoginStatus.VALID : base_uploader_1.LoginStatus.UNKNOWN;
        }
        catch (e) {
            this.logger.warn('视频号登录态检查失败', e);
            return base_uploader_1.LoginStatus.UNKNOWN;
        }
        finally {
            await context.close();
        }
    }
    async login(accountId) {
        const context = await this.browserPool.createContext();
        const page = await this.browserPool.createPage(context);
        try {
            await page.goto(this.CREATOR_URL, { waitUntil: 'networkidle' });
            await page.waitForURL('**/platform/home**', { timeout: 120000 });
            const cookies = await context.cookies();
            const storedCookies = cookies.map((c) => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                expires: c.expires,
                httpOnly: c.httpOnly,
                secure: c.secure,
                sameSite: c.sameSite,
            }));
            await this.cookieManager.saveCookies(accountId, storedCookies);
            this.logger.log(`视频号登录成功: accountId=${accountId}`);
            return storedCookies;
        }
        finally {
            await context.close();
        }
    }
    async publish(task, cookies) {
        const context = await this.browserPool.createContext({ cookies });
        const page = await this.browserPool.createPage(context);
        try {
            await page.goto(this.UPLOAD_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            if (page.url().includes('login') || await page.locator('[class*="scan"]').first().isVisible().catch(() => false)) {
                return { success: false, errorMsg: '登录态已过期，请重新扫码登录' };
            }
            if (!task.mediaUrls.length) {
                return { success: false, errorMsg: '没有可上传的视频文件' };
            }
            const fileInput = page.locator('input[type="file"]').first();
            await fileInput.waitFor({ timeout: 10000 });
            const videoUrl = task.mediaUrls[0];
            const tempPath = `/tmp/wechat_video_upload_${Date.now()}.mp4`;
            await this.downloadFile(videoUrl, tempPath);
            await fileInput.setInputFiles(tempPath);
            await this.waitForUploadComplete(page);
            const descEditor = page.locator('.input-editor, [contenteditable="true"], .ql-editor').first();
            await descEditor.waitFor({ timeout: 10000 });
            await descEditor.click();
            const description = task.content.slice(0, 1000);
            await page.keyboard.type(description);
            if (task.tags.length > 0) {
                for (const tag of task.tags.slice(0, 5)) {
                    await page.keyboard.type(`#${tag}`);
                    await page.waitForTimeout(800);
                    const suggestion = page.locator(`.topic-item:has-text("${tag}"), .mention-item`).first();
                    if (await suggestion.isVisible().catch(() => false)) {
                        await suggestion.click();
                    }
                    else {
                        await page.keyboard.press('Space');
                    }
                    await page.waitForTimeout(500);
                }
            }
            await page.waitForTimeout(2000);
            const publishBtn = page.locator('button:has-text("发表"), button:has-text("发布"), .btn-publish').first();
            await publishBtn.waitFor({ timeout: 10000 });
            await publishBtn.click();
            await page.waitForTimeout(5000);
            const success = await page.locator(':text("发表成功"), :text("发布成功"), .success').first().isVisible().catch(() => false);
            if (success) {
                const newCookies = await context.cookies();
                await this.cookieManager.saveCookies(task.accountId, newCookies.map((c) => ({
                    name: c.name,
                    value: c.value,
                    domain: c.domain,
                    path: c.path,
                    expires: c.expires,
                    httpOnly: c.httpOnly,
                    secure: c.secure,
                    sameSite: c.sameSite,
                })));
                return { success: true };
            }
            const errorText = await page.locator('.error, .toast-error, [class*="error"]').first().textContent().catch(() => null);
            return {
                success: false,
                errorMsg: errorText || '发布结果未知，请手动检查',
            };
        }
        catch (error) {
            this.logger.error('视频号发布异常', error.stack);
            return { success: false, errorMsg: error.message };
        }
        finally {
            await this.cleanup();
            await context.close();
        }
    }
    async waitForUploadComplete(page) {
        const maxWait = 300000;
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            const complete = await page.locator(':text("上传成功"), :text("上传完成"), [class*="upload-success"]').first().isVisible().catch(() => false);
            if (complete) {
                await page.waitForTimeout(2000);
                return;
            }
            await page.waitForTimeout(3000);
        }
        throw new Error('视频上传超时（5分钟）');
    }
    async downloadFile(url, destPath) {
        const { safeDownload } = require('../utils/safe-file-ops');
        await safeDownload(url, destPath);
    }
    async cleanup() {
        const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
        safeCleanupTempFiles('wechat_video_upload_');
    }
};
exports.WechatVideoUploader = WechatVideoUploader;
exports.WechatVideoUploader = WechatVideoUploader = WechatVideoUploader_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [browser_pool_1.BrowserPool,
        cookie_manager_1.CookieManager,
        uploader_service_1.UploaderService])
], WechatVideoUploader);
//# sourceMappingURL=wechat-video.uploader.js.map