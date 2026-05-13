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
var WeiboUploader_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeiboUploader = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const base_uploader_1 = require("../base-uploader");
const browser_pool_1 = require("../browser-pool");
const cookie_manager_1 = require("../cookie-manager");
const uploader_service_1 = require("../uploader.service");
let WeiboUploader = WeiboUploader_1 = class WeiboUploader extends base_uploader_1.BaseUploader {
    constructor(browserPool, cookieManager, uploaderService) {
        super();
        this.browserPool = browserPool;
        this.cookieManager = cookieManager;
        this.uploaderService = uploaderService;
        this.logger = new common_1.Logger(WeiboUploader_1.name);
        this.platform = client_1.Platform.WEIBO;
        this.name = '微博';
        this.CREATOR_URL = 'https://weibo.com';
        this.PUBLISH_URL = 'https://weibo.com/upload/channel';
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
            await page.waitForTimeout(2000);
            const url = page.url();
            if (url.includes('login') || url.includes('passport')) {
                return base_uploader_1.LoginStatus.EXPIRED;
            }
            return base_uploader_1.LoginStatus.VALID;
        }
        catch {
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
            await page.goto('https://passport.weibo.com/sso/signin', { waitUntil: 'networkidle' });
            await page.waitForURL('**/weibo.com/**', { timeout: 120000 });
            const cookies = await context.cookies();
            const storedCookies = cookies.map((c) => ({
                name: c.name, value: c.value, domain: c.domain, path: c.path,
                expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
                sameSite: c.sameSite,
            }));
            await this.cookieManager.saveCookies(accountId, storedCookies);
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
            const isVideo = task.mediaUrls.some((u) => /\.(mp4|mov|avi)/i.test(u));
            if (isVideo) {
                return await this.publishVideo(page, task, context);
            }
            else {
                return await this.publishPost(page, task, context);
            }
        }
        catch (error) {
            return { success: false, errorMsg: error.message };
        }
        finally {
            const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
            safeCleanupTempFiles('weibo_upload_');
            await context.close();
        }
    }
    async publishVideo(page, task, context) {
        await page.goto(this.PUBLISH_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        if (page.url().includes('login') || page.url().includes('passport')) {
            return { success: false, errorMsg: '登录态已过期' };
        }
        const fileInput = page.locator('input[type="file"]').first();
        await fileInput.waitFor({ timeout: 10000 });
        const tempPath = `/tmp/weibo_upload_${Date.now()}.mp4`;
        await this.downloadFile(task.mediaUrls[0], tempPath);
        await fileInput.setInputFiles(tempPath);
        await this.waitForUpload(page);
        const titleInput = page.locator('[placeholder*="标题"], .title-input, input[name="title"]').first();
        if (await titleInput.isVisible().catch(() => false)) {
            await titleInput.click();
            await titleInput.fill(task.title.slice(0, 40));
        }
        const descInput = page.locator('[placeholder*="描述"], .desc-input, textarea').first();
        if (await descInput.isVisible().catch(() => false)) {
            await descInput.click();
            await page.keyboard.type(task.content.slice(0, 500));
        }
        for (const tag of task.tags.slice(0, 3)) {
            await page.keyboard.type(`#${tag}# `);
            await page.waitForTimeout(300);
        }
        await page.waitForTimeout(2000);
        const publishBtn = page.locator('button:has-text("发布"), [class*="publish"]').first();
        await publishBtn.click();
        await page.waitForTimeout(5000);
        const success = await page.locator(':text("发布成功"), :text("已发布")').first().isVisible().catch(() => false);
        if (success) {
            await this.saveCookies(task.accountId, context);
            return { success: true };
        }
        return { success: false, errorMsg: '发布结果未知' };
    }
    async publishPost(page, task, context) {
        await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        const editor = page.locator('[placeholder*="有什么新鲜事"], .Form_input, textarea[node-type="textEl"]').first();
        if (await editor.isVisible().catch(() => false)) {
            await editor.click();
            await page.waitForTimeout(500);
            let text = task.title ? `【${task.title}】\n` : '';
            text += task.content.slice(0, 500);
            for (const tag of task.tags.slice(0, 3)) {
                text += ` #${tag}#`;
            }
            await page.keyboard.type(text);
        }
        if (task.mediaUrls.length > 0) {
            const imgInput = page.locator('input[type="file"][accept*="image"]').first();
            if (await imgInput.isVisible().catch(() => false)) {
                for (const url of task.mediaUrls.slice(0, 9)) {
                    const tempPath = `/tmp/weibo_upload_${Date.now()}.jpg`;
                    await this.downloadFile(url, tempPath);
                    await imgInput.setInputFiles(tempPath);
                    await page.waitForTimeout(1000);
                }
            }
        }
        await page.waitForTimeout(1000);
        const sendBtn = page.locator('button:has-text("发送"), [node-type="submit"]').first();
        await sendBtn.click();
        await page.waitForTimeout(3000);
        await this.saveCookies(task.accountId, context);
        return { success: true };
    }
    async saveCookies(accountId, context) {
        const cookies = await context.cookies();
        await this.cookieManager.saveCookies(accountId, cookies.map((c) => ({
            name: c.name, value: c.value, domain: c.domain, path: c.path,
            expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
            sameSite: c.sameSite,
        })));
    }
    async waitForUpload(page) {
        const maxWait = 300000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const done = await page.locator(':text("上传完成"), :text("上传成功")').first().isVisible().catch(() => false);
            if (done)
                return;
            await page.waitForTimeout(3000);
        }
        throw new Error('上传超时');
    }
    async downloadFile(url, dest) {
        const { safeDownload } = require('../utils/safe-file-ops');
        await safeDownload(url, dest);
    }
};
exports.WeiboUploader = WeiboUploader;
exports.WeiboUploader = WeiboUploader = WeiboUploader_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [browser_pool_1.BrowserPool,
        cookie_manager_1.CookieManager,
        uploader_service_1.UploaderService])
], WeiboUploader);
//# sourceMappingURL=weibo.uploader.js.map