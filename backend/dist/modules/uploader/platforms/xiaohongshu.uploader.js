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
var XiaohongshuUploader_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XiaohongshuUploader = void 0;
const common_1 = require("@nestjs/common");
const prisma_enums_1 = require("../../../common/prisma-enums");
const base_uploader_1 = require("../base-uploader");
const browser_pool_1 = require("../browser-pool");
const cookie_manager_1 = require("../cookie-manager");
const uploader_service_1 = require("../uploader.service");
let XiaohongshuUploader = XiaohongshuUploader_1 = class XiaohongshuUploader extends base_uploader_1.BaseUploader {
    constructor(browserPool, cookieManager, uploaderService) {
        super();
        this.browserPool = browserPool;
        this.cookieManager = cookieManager;
        this.uploaderService = uploaderService;
        this.logger = new common_1.Logger(XiaohongshuUploader_1.name);
        this.platform = prisma_enums_1.Platform.XIAOHONGSHU;
        this.name = '[garbled]';
        this.CREATOR_URL = 'https://creator.xiaohongshu.com';
        this.PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish';
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
            const hasUser = await page.locator('.user-name, .creator-info, .avatar').first().isVisible().catch(() => false);
            return hasUser ? base_uploader_1.LoginStatus.VALID : base_uploader_1.LoginStatus.UNKNOWN;
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
            await page.goto(`${this.CREATOR_URL}/login`, { waitUntil: 'networkidle' });
            await page.waitForURL('**/creator.xiaohongshu.com/**', { timeout: 120000 });
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
            await page.goto(this.PUBLISH_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            if (page.url().includes('login')) {
                return { success: false, errorMsg: '' };
            }
            const isVideo = task.mediaUrls.some((u) => /\.(mp4|mov|avi)/i.test(u));
            if (isVideo) {
                const videoTab = page.locator('').first();
                if (await videoTab.isVisible().catch(() => false)) {
                    await videoTab.click();
                    await page.waitForTimeout(1000);
                }
            }
            const fileInput = page.locator('input[type="file"]').first();
            await fileInput.waitFor({ timeout: 10000 });
            const mediaUrl = task.mediaUrls[0];
            const ext = isVideo ? 'mp4' : 'jpg';
            const tempPath = `/tmp/xhs_upload_${Date.now()}.${ext}`;
            await this.downloadFile(mediaUrl, tempPath);
            await fileInput.setInputFiles(tempPath);
            await this.waitForUpload(page);
            const titleInput = page.locator('').first();
            if (await titleInput.isVisible().catch(() => false)) {
                await titleInput.click();
                await titleInput.fill(task.title || '');
            }
            const contentInput = page.locator('').first();
            if (await contentInput.isVisible().catch(() => false)) {
                await contentInput.click();
                await page.keyboard.type(task.content.slice(0, 1000));
            }
            for (const tag of task.tags.slice(0, 5)) {
                await page.keyboard.type(`#${tag} `);
                await page.waitForTimeout(500);
            }
            await page.waitForTimeout(2000);
            const publishBtn = page.locator('').first();
            await publishBtn.click();
            await page.waitForTimeout(5000);
            const success = await page.locator('').first().isVisible().catch(() => false);
            if (success) {
                const newCookies = await context.cookies();
                await this.cookieManager.saveCookies(task.accountId, newCookies.map((c) => ({
                    name: c.name, value: c.value, domain: c.domain, path: c.path,
                    expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
                    sameSite: c.sameSite,
                })));
                return { success: true };
            }
            const errorText = await page.locator('[class*="error"], .toast').first().textContent().catch(() => null);
            return { success: false, errorMsg: errorText || '' };
        }
        catch (error) {
            return { success: false, errorMsg: error.message };
        }
        finally {
            await this.cleanup('xhs');
            await context.close();
        }
    }
    async waitForUpload(page) {
        const maxWait = 180000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const done = await page.locator('').first().isVisible().catch(() => false);
            if (done)
                return;
            await page.waitForTimeout(3000);
        }
        throw new Error('');
    }
    async downloadFile(url, dest) {
        const { safeDownload } = require('../utils/safe-file-ops');
        await safeDownload(url, dest);
    }
    async cleanup(prefix) {
        const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
        safeCleanupTempFiles(`${prefix}_upload_`);
    }
};
exports.XiaohongshuUploader = XiaohongshuUploader;
exports.XiaohongshuUploader = XiaohongshuUploader = XiaohongshuUploader_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [browser_pool_1.BrowserPool,
        cookie_manager_1.CookieManager,
        uploader_service_1.UploaderService])
], XiaohongshuUploader);
//# sourceMappingURL=xiaohongshu.uploader.js.map