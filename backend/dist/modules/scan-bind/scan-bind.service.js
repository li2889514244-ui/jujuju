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
var ScanBindService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanBindService = void 0;
const common_1 = require("@nestjs/common");
const browser_pool_1 = require("../uploader/browser-pool");
const prisma_service_1 = require("../../prisma/prisma.service");
const cookie_crypto_1 = require("../../common/utils/cookie-crypto");
const PLATFORM_LOGIN_CONFIG = {
    DOUYIN: {
        url: 'https://creator.douyin.com/creator-micro/content',
        successIndicator: /creator\.douyin\.com\/creator-micro/,
    },
    XIAOHONGSHU: {
        url: 'https://creator.xiaohongshu.com/publish/publish',
        successIndicator: /creator\.xiaohongshu\.com\/(publish|home)/,
    },
    KUAISHOU: {
        url: 'https://cp.kuaishou.com/article/publish',
        successIndicator: /cp\.kuaishou\.com\/(article|profile)/,
    },
    BILIBILI: {
        url: 'https://member.bilibili.com/platform/home',
        successIndicator: /member\.bilibili\.com/,
    },
    WEIBO: {
        url: 'https://weibo.com/login.php',
        successIndicator: /weibo\.com\/(u\/\d+|home)/,
    },
    WECHAT_VIDEO: {
        url: 'https://channels.weixin.qq.com/',
        successIndicator: /channels\.weixin\.qq\.com\/(platform|web)/,
    },
};
const QR_SELECTORS = [
    'img[src*="qrcode"]',
    'img[src*="qr_code"]',
    'img[src*="qr-code"]',
    'img[src*="QR"]',
    'img[src*="login"]',
    'canvas[class*="qr"]',
    'canvas[class*="QR"]',
    '.qrcode-img img',
    '.qrcode img',
    '.qr-code img',
    '.qr_code img',
    '.login-qrcode img',
    '.login_qrcode canvas',
    '[class*="qrcode"] img',
    '[class*="qr-code"] img',
    '[class*="qr_code"] img',
    '[class*="QRCode"] img',
    '[class*="scan"] img',
    '#login-qrcode img',
    '#qrcode img',
    '.scan-code img',
];
let ScanBindService = ScanBindService_1 = class ScanBindService {
    constructor(browserPool, prisma) {
        this.browserPool = browserPool;
        this.prisma = prisma;
        this.logger = new common_1.Logger(ScanBindService_1.name);
        this.sessions = new Map();
    }
    async startScanSession(params) {
        const session = { ...params, cancelled: false };
        this.sessions.set(params.clientId, session);
        const config = PLATFORM_LOGIN_CONFIG[params.platform];
        if (!config) {
            params.onError(`Unsupported platform: ${params.platform}`);
            return;
        }
        try {
            params.onStatus('launching', 'Starting browser...');
            const context = await this.browserPool.createContext({ viewport: { width: 1280, height: 800 } });
            session.context = context;
            const page = await this.browserPool.createPage(context);
            session.page = page;
            if (session.cancelled)
                return this.cleanup(session);
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            });
            params.onStatus('navigating', 'Opening login page...');
            await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {
                return page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            });
            if (session.cancelled)
                return this.cleanup(session);
            await page.waitForTimeout(5000);
            params.onStatus('waiting_qr', 'Looking for QR code...');
            await this.pollQrCodeAndStatus(session, config);
        }
        catch (error) {
            if (!session.cancelled) {
                this.logger.error(`Scan session error: ${error.message}`);
                params.onError(error.message || 'Scan process failed');
            }
            this.cleanup(session);
        }
    }
    async pollQrCodeAndStatus(session, config) {
        const { page, onQrCode, onStatus, onSuccess, onError } = session;
        if (!page)
            return;
        let attempts = 0;
        const maxAttempts = 180;
        let qrSent = false;
        while (attempts < maxAttempts && !session.cancelled) {
            await page.waitForTimeout(2000);
            attempts++;
            try {
                const currentUrl = page.url();
                const indicator = config.successIndicator;
                const isLoggedIn = indicator instanceof RegExp
                    ? indicator.test(currentUrl)
                    : currentUrl.includes(indicator);
                if (isLoggedIn) {
                    onStatus('logged_in', 'Login detected, extracting account info...');
                    await page.waitForTimeout(2000);
                    const accountData = await this.extractAccountInfo(page, session.platform);
                    await this.saveAccount({
                        platform: session.platform,
                        userId: session.userId,
                        cookies: accountData.cookies,
                        nickname: accountData.nickname,
                        avatar: accountData.avatar,
                        platformUserId: accountData.platformUserId,
                    });
                    onSuccess(accountData);
                    return;
                }
                if (!qrSent) {
                    let qrElement = null;
                    qrElement = page.getByRole('img', { name: /二维码|QR|qr|扫码|scan/i }).first();
                    try {
                        const box = await qrElement.boundingBox().catch(() => null);
                        if (box && box.width > 80 && box.height > 80) {
                            this.logger.log(`Found QR via getByRole (${box.width}x${box.height})`);
                        }
                        else {
                            qrElement = null;
                        }
                    }
                    catch {
                        qrElement = null;
                    }
                    if (!qrElement) {
                        for (const selector of QR_SELECTORS) {
                            try {
                                qrElement = page.locator(selector).first();
                                const count = await page.locator(selector).count();
                                if (count > 0) {
                                    const box = await qrElement.boundingBox().catch(() => null);
                                    if (box && box.width > 80 && box.height > 80) {
                                        this.logger.log(`Found QR via: ${selector} (${box.width}x${box.height})`);
                                        break;
                                    }
                                    else {
                                        qrElement = null;
                                    }
                                }
                                else {
                                    qrElement = null;
                                }
                            }
                            catch {
                                qrElement = null;
                            }
                        }
                    }
                    if (!qrElement) {
                        const imgs = page.locator('img');
                        const imgCount = await imgs.count();
                        for (let i = 0; i < Math.min(imgCount, 50); i++) {
                            try {
                                const img = imgs.nth(i);
                                const box = await img.boundingBox().catch(() => null);
                                const src = await img.getAttribute('src').catch(() => '');
                                if (box && box.width > 100 && box.height > 100 && box.width < 500 && box.height < 500) {
                                    if (src && (src.includes('qr') || src.includes('QR') || src.includes('code') || src.includes('scan'))) {
                                        qrElement = img;
                                        this.logger.log(`Fallback QR via <img> #${i}: ${box.width}x${box.height} src=${src.substring(0, 50)}`);
                                        break;
                                    }
                                }
                            }
                            catch { }
                        }
                    }
                    if (qrElement) {
                        const screenshot = await qrElement.screenshot({ type: 'png' }).catch(() => null);
                        if (screenshot) {
                            const base64 = screenshot.toString('base64');
                            onQrCode(`data:image/png;base64,${base64}`);
                            qrSent = true;
                            onStatus('waiting_scan', 'Please scan the QR code with the platform app');
                        }
                    }
                    else if (attempts > 10 && !qrSent) {
                        const viewportShot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1280, height: 720 } }).catch(() => null);
                        if (viewportShot) {
                            this.logger.warn('No QR element found, sending viewport screenshot');
                            const base64 = viewportShot.toString('base64');
                            onQrCode(`data:image/png;base64,${base64}`);
                            qrSent = true;
                            onStatus('waiting_scan', 'Please scan the QR code on screen');
                        }
                    }
                }
            }
            catch (err) {
                this.logger.warn(`Poll error: ${err.message}`);
            }
        }
        if (!session.cancelled) {
            onError('QR code scan timed out. Please try again.');
        }
        this.cleanup(session);
    }
    async extractAccountInfo(page, platform) {
        const cookies = await page.context().cookies();
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        let nickname = '';
        let avatar = '';
        let platformUserId = '';
        try {
            await page.waitForTimeout(3000);
            switch (platform) {
                case 'DOUYIN':
                    await page.waitForTimeout(3000);
                    nickname = await page.$eval('[class*="name"], [class*="nickname"], .account-name span', el => el.textContent?.trim() || '').catch(() => '');
                    avatar = await page.$eval('[class*="avatar"] img, .avatar-img img', el => el.src || '').catch(() => '');
                    platformUserId = await page.evaluate(() => {
                        const match = document.cookie.match(/(?:uid|user_id|passport_csrf_token)=([^;]+)/);
                        return match ? match[1].substring(0, 30) : '';
                    });
                    break;
                case 'XIAOHONGSHU':
                    await page.waitForTimeout(3000);
                    nickname = await page.$eval('[class*="name"], [class*="nickname"], .username', el => el.textContent?.trim() || '').catch(() => '');
                    avatar = await page.$eval('[class*="avatar"] img, .avatar-img img', el => el.src || '').catch(() => '');
                    platformUserId = await page.evaluate(() => {
                        const match = document.cookie.match(/a1=([^;]+)/);
                        return match ? match[1].substring(0, 20) : '';
                    });
                    break;
                case 'KUAISHOU':
                    await page.waitForTimeout(3000);
                    nickname = await page.$eval('[class*="name"], [class*="nickname"]', el => el.textContent?.trim() || '').catch(() => '');
                    avatar = await page.$eval('[class*="avatar"] img, [class*="head"] img', el => el.src || '').catch(() => '');
                    platformUserId = await page.evaluate(() => {
                        const match = document.cookie.match(/userId=([^;]+)/);
                        return match ? match[1] : '';
                    });
                    break;
                case 'BILIBILI':
                    await page.waitForTimeout(2000);
                    nickname = await page.$eval('[class*="nickname"], .h-name', el => el.textContent?.trim() || '').catch(() => '');
                    avatar = await page.$eval('[class*="avatar"] img, .h-avatar img', el => el.src || '').catch(() => '');
                    platformUserId = await page.evaluate(() => {
                        const match = document.cookie.match(/DedeUserID=(\d+)/);
                        return match ? match[1] : '';
                    });
                    break;
                case 'WEIBO':
                    await page.waitForTimeout(3000);
                    nickname = await page.$eval('[class*="name"], .username', el => el.textContent?.trim() || '').catch(() => '');
                    avatar = await page.$eval('[class*="avatar"] img, .face img', el => el.src || '').catch(() => '');
                    platformUserId = await page.evaluate(() => {
                        const match = document.cookie.match(/uid=(\d+)/);
                        return match ? match[1] : '';
                    });
                    break;
                case 'WECHAT_VIDEO':
                    await page.waitForTimeout(3000);
                    nickname = await page.$eval('[class*="nickname"], [class*="name"]', el => el.textContent?.trim() || '').catch(() => '');
                    avatar = await page.$eval('[class*="avatar"] img, [class*="head"] img', el => el.src || '').catch(() => '');
                    platformUserId = await page.evaluate(() => {
                        const match = document.cookie.match(/finder_uid=([^;]+)/);
                        return match ? match[1] : '';
                    });
                    break;
            }
        }
        catch (err) {
            this.logger.warn(`Extract info partial failure (${platform}): ${err.message}`);
        }
        return {
            cookies: cookieStr,
            nickname: nickname || `${platform}_user`,
            avatar,
            platformUserId: platformUserId || `scan_${Date.now()}`,
        };
    }
    async saveAccount(params) {
        const encryptionKey = process.env.COOKIE_ENCRYPTION_KEY;
        if (!encryptionKey || encryptionKey.length < 32) {
            throw new Error('COOKIE_ENCRYPTION_KEY not configured');
        }
        const encryptedCookies = (0, cookie_crypto_1.encryptCookie)(params.cookies, encryptionKey);
        const account = await this.prisma.account.upsert({
            where: {
                platform_platformUserId: {
                    platform: params.platform,
                    platformUserId: params.platformUserId,
                },
            },
            update: {
                cookies: encryptedCookies,
                nickname: params.nickname,
                avatar: params.avatar,
            },
            create: {
                platform: params.platform,
                platformUserId: params.platformUserId,
                nickname: params.nickname,
                avatar: params.avatar,
                cookies: encryptedCookies,
                userId: params.userId,
            },
            include: {
                owner: { select: { id: true, name: true, email: true } },
            },
        });
        const { cookies, ...rest } = account;
        return { ...rest, hasCookies: true };
    }
    cancelSession(clientId) {
        const session = this.sessions.get(clientId);
        if (session) {
            session.cancelled = true;
            this.cleanup(session);
        }
    }
    async cleanup(session) {
        if (session.timer) {
            clearTimeout(session.timer);
            session.timer = undefined;
        }
        if (session.context) {
            try {
                await session.context.close();
            }
            catch { }
            session.context = undefined;
        }
        session.page = undefined;
        this.sessions.delete(session.clientId);
    }
};
exports.ScanBindService = ScanBindService;
exports.ScanBindService = ScanBindService = ScanBindService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [browser_pool_1.BrowserPool,
        prisma_service_1.PrismaService])
], ScanBindService);
//# sourceMappingURL=scan-bind.service.js.map