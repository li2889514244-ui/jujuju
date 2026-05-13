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
var KuaishouUploader_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KuaishouUploader = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const base_uploader_1 = require("../base-uploader");
const browser_pool_1 = require("../browser-pool");
const cookie_manager_1 = require("../cookie-manager");
const uploader_service_1 = require("../uploader.service");
let KuaishouUploader = KuaishouUploader_1 = class KuaishouUploader extends base_uploader_1.BaseUploader {
    constructor(browserPool, cookieManager, uploaderService) {
        super();
        this.browserPool = browserPool;
        this.cookieManager = cookieManager;
        this.uploaderService = uploaderService;
        this.logger = new common_1.Logger(KuaishouUploader_1.name);
        this.platform = client_1.Platform.KUAISHOU;
        this.name = '快手';
        this.CREATOR_URL = 'https://cp.kuaishou.com';
        this.PUBLISH_URL = 'https://cp.kuaishou.com/article/publish/video';
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
            await page.goto(`${this.CREATOR_URL}/login`, { waitUntil: 'networkidle' });
            await page.waitForURL('**/cp.kuaishou.com/**', { timeout: 120000 });
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
                return { success: false, errorMsg: '登录态已过期' };
            }
            const fileInput = page.locator('input[type="file"]').first();
            await fileInput.waitFor({ timeout: 10000 });
            const tempPath = `/tmp/ks_upload_${Date.now()}.mp4`;
            await this.downloadFile(task.mediaUrls[0], tempPath);
            await fileInput.setInputFiles(tempPath);
            await this.waitForUpload(page);
            const descInput = page.locator('.ql-editor, [placeholder*="描述"], [placeholder*="作品"]').first();
            if (await descInput.isVisible().catch(() => false)) {
                await descInput.click();
                const text = task.title ? `${task.title}\n${task.content}` : task.content;
                await page.keyboard.type(text.slice(0, 500));
            }
            for (const tag of task.tags.slice(0, 5)) {
                await page.keyboard.type(`#${tag} `);
                await page.waitForTimeout(500);
            }
            await page.waitForTimeout(2000);
            const publishBtn = page.locator('button:has-text("发布"), [class*="publish"]').first();
            await publishBtn.click();
            await page.waitForTimeout(5000);
            const success = await page.locator(':text("发布成功"), :text("已发布")').first().isVisible().catch(() => false);
            if (success) {
                const newCookies = await context.cookies();
                await this.cookieManager.saveCookies(task.accountId, newCookies.map((c) => ({
                    name: c.name, value: c.value, domain: c.domain, path: c.path,
                    expires: c.expires, httpOnly: c.httpOnly, secure: c.secure,
                    sameSite: c.sameSite,
                })));
                return { success: true };
            }
            return { success: false, errorMsg: '发布结果未知，请手动检查' };
        }
        catch (error) {
            return { success: false, errorMsg: error.message };
        }
        finally {
            const { safeCleanupTempFiles } = require('../utils/safe-file-ops');
            safeCleanupTempFiles('ks_upload_');
            await context.close();
        }
    }
    async waitForUpload(page) {
        const maxWait = 300000;
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const done = await page.locator(':text("上传完成"), :text("上传成功"), [class*="success"]').first().isVisible().catch(() => false);
            if (done)
                return;
            await page.waitForTimeout(3000);
        }
        throw new Error('视频上传超时');
    }
    async downloadFile(url, dest) {
        const { safeDownload } = require('../utils/safe-file-ops');
        await safeDownload(url, dest);
    }
};
exports.KuaishouUploader = KuaishouUploader;
exports.KuaishouUploader = KuaishouUploader = KuaishouUploader_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [browser_pool_1.BrowserPool,
        cookie_manager_1.CookieManager,
        uploader_service_1.UploaderService])
], KuaishouUploader);
//# sourceMappingURL=kuaishou.uploader.js.map