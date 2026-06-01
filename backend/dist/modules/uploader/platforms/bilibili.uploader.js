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
var BilibiliUploader_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BilibiliUploader = void 0;
const common_1 = require("@nestjs/common");
const prisma_enums_1 = require("../../../common/prisma-enums");
const base_uploader_1 = require("../base-uploader");
const browser_pool_1 = require("../browser-pool");
const cookie_manager_1 = require("../cookie-manager");
const uploader_service_1 = require("../uploader.service");
let BilibiliUploader = BilibiliUploader_1 = class BilibiliUploader extends base_uploader_1.BaseUploader {
    constructor(browserPool, cookieManager, uploaderService) {
        super();
        this.browserPool = browserPool;
        this.cookieManager = cookieManager;
        this.uploaderService = uploaderService;
        this.logger = new common_1.Logger(BilibiliUploader_1.name);
        this.platform = prisma_enums_1.Platform.BILIBILI;
        this.name = '[garbled]';
        this.CREATOR_URL = 'https://member.bilibili.com';
        this.UPLOAD_URL = 'https://member.bilibili.com/platform/upload/video/frame';
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
            if (url.includes('passport.bilibili.com') || url.includes('login')) {
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
            await page.goto('https://passport.bilibili.com/login', { waitUntil: 'networkidle' });
            await page.waitForURL('**/member.bilibili.com/**', { timeout: 120000 });
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
            await page.goto(this.UPLOAD_URL, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);
            if (page.url().includes('passport') || page.url().includes('login')) {
                return { success: false, errorMsg: '' };
            }
            const fileInput = page.locator('input[type="file"]').first();
            await fileInput.waitFor({ timeout: 10000 });
            const tempPath = `/tmp/bili_upload_${Date.now()}.mp4`;
            await this.downloadFile(task.mediaUrls[0], tempPath);
            await fileInput.setInputFiles(tempPath);
            await this.waitForUpload(page);
            const titleInput = page.locator('').first();
            if (await titleInput.isVisible().catch(() => false)) {
                await titleInput.click();
                await titleInput.fill(task.title.slice(0, 80));
            }
            const typeSelector = page.locator('.type-wrp, [class*="channel"]').first();
            if (await typeSelector.isVisible().catch(() => false)) {
                await typeSelector.click();
                await page.waitForTimeout(500);
                const firstOption = page.locator('.type-list li, .channel-item').first();
                if (await firstOption.isVisible().catch(() => false)) {
                    await firstOption.click();
                }
            }
            const descInput = page.locator('').first();
            if (await descInput.isVisible().catch(() => false)) {
                await descInput.click();
                await page.keyboard.type(task.content.slice(0, 250));
            }
            const tagInput = page.locator('').first();
            if (await tagInput.isVisible().catch(() => false)) {
                for (const tag of task.tags.slice(0, 5)) {
                    await tagInput.click();
                    await tagInput.fill(tag);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(300);
                }
            }
            await page.waitForTimeout(2000);
            const submitBtn = page.locator('').first();
            await submitBtn.click();
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
            const errorText = await page.locator('[class*="error"], .tips-wrp').first().textContent().catch(() => null);
            return { success: false, errorMsg: errorText || '' };
        }
        catch (error) {
            return { success: false, errorMsg: error.message };
        }
        finally {
            const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
            safeCleanupTempFiles('bili_upload_');
            await context.close();
        }
    }
    async waitForUpload(page) {
        const maxWait = 600000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const done = await page.locator('').first().isVisible().catch(() => false);
            if (done)
                return;
            await page.waitForTimeout(5000);
        }
        throw new Error('');
    }
    async downloadFile(url, dest) {
        const { safeDownload } = require('../utils/safe-file-ops');
        await safeDownload(url, dest);
    }
};
exports.BilibiliUploader = BilibiliUploader;
exports.BilibiliUploader = BilibiliUploader = BilibiliUploader_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [browser_pool_1.BrowserPool,
        cookie_manager_1.CookieManager,
        uploader_service_1.UploaderService])
], BilibiliUploader);
//# sourceMappingURL=bilibili.uploader.js.map