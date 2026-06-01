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
var DataSyncScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataSyncScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../../prisma/prisma.service");
const browser_pool_1 = require("../uploader/browser-pool");
const cookie_manager_1 = require("../uploader/cookie-manager");
const prisma_enums_1 = require("../../common/prisma-enums");
let DataSyncScheduler = DataSyncScheduler_1 = class DataSyncScheduler {
    constructor(prisma, browserPool, cookieManager) {
        this.prisma = prisma;
        this.browserPool = browserPool;
        this.cookieManager = cookieManager;
        this.logger = new common_1.Logger(DataSyncScheduler_1.name);
        this.isRunning = false;
    }
    async handleDailySync() {
        if (this.isRunning) {
            this.logger.warn('[garbled]');
            return;
        }
        this.isRunning = true;
        this.logger.log('');
        try {
            const accounts = await this.prisma.account.findMany({
                where: { status: 'ACTIVE' },
                select: { id: true, platform: true, cookies: true, nickname: true },
            });
            this.logger.log(`Data sync: ${accounts.length} accounts to collect`);
            let successCount = 0;
            let failCount = 0;
            for (const account of accounts) {
                try {
                    const cookies = account.cookies
                        ? this.cookieManager.decryptCookie(account.cookies)
                        : [];
                    if (cookies.length === 0) {
                        this.logger.debug(`Skipping account without cookies: ${account.nickname}`);
                        continue;
                    }
                    const metrics = await this.collectMetrics(account.platform, cookies);
                    if (metrics) {
                        await this.saveMetrics(account.id, account.platform, metrics);
                        successCount++;
                    }
                    await this.delay(5000 + Math.random() * 5000);
                }
                catch (error) {
                    failCount++;
                    this.logger.warn(`Collection failed [${account.nickname}]: ${error.message}`);
                }
            }
            this.logger.log(`Data collection complete: ${successCount} success, ${failCount} failed`);
        }
        catch (error) {
            this.logger.error('', error.stack);
        }
        finally {
            this.isRunning = false;
        }
    }
    async collectMetrics(platform, cookies) {
        const context = await this.browserPool.createContext({ cookies });
        const page = await this.browserPool.createPage(context);
        try {
            switch (platform) {
                case prisma_enums_1.Platform.DOUYIN:
                    return await this.collectDouyin(page);
                case prisma_enums_1.Platform.XIAOHONGSHU:
                    return await this.collectXiaohongshu(page);
                case prisma_enums_1.Platform.KUAISHOU:
                    return await this.collectKuaishou(page);
                case prisma_enums_1.Platform.BILIBILI:
                    return await this.collectBilibili(page);
                case prisma_enums_1.Platform.WEIBO:
                    return await this.collectWeibo(page);
                case prisma_enums_1.Platform.WECHAT_VIDEO:
                    return await this.collectWechatVideo(page);
                default:
                    return null;
            }
        }
        finally {
            await context.close();
        }
    }
    async collectDouyin(page) {
        await page.goto('https://creator.douyin.com/creator-micro/data/overview', {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForTimeout(3000);
        if (page.url().includes('login'))
            return null;
        const followers = await this.extractNumber(page, '');
        const likes = await this.extractNumber(page, '');
        const views = await this.extractNumber(page, '');
        return { followers, likes, views, comments: 0 };
    }
    async collectXiaohongshu(page) {
        await page.goto('https://creator.xiaohongshu.com/statistics', {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForTimeout(3000);
        if (page.url().includes('login'))
            return null;
        const followers = await this.extractNumber(page, '');
        const likes = await this.extractNumber(page, '');
        const views = await this.extractNumber(page, '');
        return { followers, likes, views, comments: 0 };
    }
    async collectKuaishou(page) {
        await page.goto('https://cp.kuaishou.com/profile', {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForTimeout(3000);
        if (page.url().includes('login'))
            return null;
        const followers = await this.extractNumber(page, '');
        const likes = await this.extractNumber(page, '');
        const views = await this.extractNumber(page, '');
        return { followers, likes, views, comments: 0 };
    }
    async collectBilibili(page) {
        await page.goto('https://member.bilibili.com/platform/home', {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForTimeout(3000);
        if (page.url().includes('passport'))
            return null;
        const followers = await this.extractNumber(page, '');
        const likes = await this.extractNumber(page, '');
        const views = await this.extractNumber(page, '');
        return { followers, likes, views, comments: 0 };
    }
    async collectWeibo(page) {
        await page.goto('https://weibo.com', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000);
        if (page.url().includes('login'))
            return null;
        const followers = await this.extractNumber(page, '');
        const likes = await this.extractNumber(page, '[class*="like"]');
        const views = await this.extractNumber(page, '[class*="read"]');
        return { followers, likes, views: views || 0, comments: 0 };
    }
    async collectWechatVideo(page) {
        await page.goto('https://channels.weixin.qq.com/platform/post/list', {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForTimeout(3000);
        if (page.url().includes('login'))
            return null;
        const followers = await this.extractNumber(page, '');
        const likes = await this.extractNumber(page, '');
        return { followers, likes, views: 0, comments: 0 };
    }
    async extractNumber(page, ...selectors) {
        for (const selector of selectors) {
            try {
                const el = page.locator(selector).first();
                if (await el.isVisible().catch(() => false)) {
                    const text = await el.textContent();
                    if (text) {
                        return this.parseChineseNumber(text.trim());
                    }
                }
            }
            catch {
                continue;
            }
        }
        return 0;
    }
    parseChineseNumber(text) {
        const cleaned = text.replace(/[,锛孿s]/g, '');
        if (cleaned.includes('万')) {
            const num = parseFloat(cleaned.replace(/[万亿]/g, ''));
            return Math.round(num * 10000);
        }
        if (cleaned.includes('亿')) {
            const num = parseFloat(cleaned.replace(/[万亿]/g, ''));
            return Math.round(num * 100000000);
        }
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : Math.round(num);
    }
    async saveMetrics(accountId, platform, metrics) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        await this.prisma.dailyStats.upsert({
            where: { accountId_date: { accountId, date: today } },
            update: {
                followers: metrics.followers,
                likes: metrics.likes,
                views: metrics.views,
                comments: metrics.comments,
            },
            create: {
                accountId,
                platform,
                date: today,
                followers: metrics.followers,
                likes: metrics.likes,
                views: metrics.views,
                comments: metrics.comments,
            },
        });
        await this.prisma.account.update({
            where: { id: accountId },
            data: { followers: metrics.followers },
        });
    }
    delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.DataSyncScheduler = DataSyncScheduler;
__decorate([
    (0, schedule_1.Cron)('0 2 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DataSyncScheduler.prototype, "handleDailySync", null);
exports.DataSyncScheduler = DataSyncScheduler = DataSyncScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        browser_pool_1.BrowserPool,
        cookie_manager_1.CookieManager])
], DataSyncScheduler);
//# sourceMappingURL=data-sync.scheduler.js.map