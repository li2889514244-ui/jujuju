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
var PlatformsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const oauth_service_1 = require("./oauth/oauth.service");
const platform_config_1 = require("./config/platform-config");
const douyin_collector_1 = require("./collectors/douyin.collector");
const kuaishou_collector_1 = require("./collectors/kuaishou.collector");
const xiaohongshu_collector_1 = require("./collectors/xiaohongshu.collector");
const shipinhao_collector_1 = require("./collectors/shipinhao.collector");
const bilibili_collector_1 = require("./collectors/bilibili.collector");
const weibo_collector_1 = require("./collectors/weibo.collector");
let PlatformsService = PlatformsService_1 = class PlatformsService {
    constructor(prisma, oauthService, douyinCollector, kuaishouCollector, xiaohongshuCollector, shipinhaoCollector, bilibiliCollector, weiboCollector) {
        this.prisma = prisma;
        this.oauthService = oauthService;
        this.logger = new common_1.Logger(PlatformsService_1.name);
        this.collectors = new Map([
            ['DOUYIN', douyinCollector],
            ['KUAISHOU', kuaishouCollector],
            ['XIAOHONGSHU', xiaohongshuCollector],
            ['WECHAT_VIDEO', shipinhaoCollector],
            ['BILIBILI', bilibiliCollector],
            ['WEIBO', weiboCollector],
        ]);
    }
    getSupportedPlatforms() {
        return Object.entries(platform_config_1.PLATFORM_CONFIGS).map(([key, config]) => ({
            key,
            name: config.name,
            oauthUrl: config.oauth.authorizeUrl,
            scopes: config.oauth.scopes,
        }));
    }
    getPlatformInfo(platform) {
        const config = platform_config_1.PLATFORM_CONFIGS[platform];
        if (!config) {
            throw new common_1.NotFoundException(`不支持的平台: ${platform}`);
        }
        return {
            key: platform,
            name: config.name,
            scopes: config.oauth.scopes,
            rateLimit: config.api.rateLimit,
        };
    }
    async getAuthorizeUrl(platform, userId, teamId) {
        if (!platform_config_1.PLATFORM_CONFIGS[platform]) {
            throw new common_1.BadRequestException(`不支持的平台: ${platform}`);
        }
        return this.oauthService.buildAuthorizeUrl(platform, userId, teamId);
    }
    async revokeAuthorization(accountId, userId) {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
        });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        if (account.userId !== userId) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
                throw new common_1.BadRequestException('无权操作此账号');
            }
        }
        const metadata = account.metadata;
        const { oauthToken, tokenExpiresAt, scope, ...restMetadata } = metadata || {};
        await this.prisma.account.update({
            where: { id: accountId },
            data: {
                metadata: restMetadata,
                status: 'INACTIVE',
            },
        });
        this.logger.log(`平台授权已解除: ${account.platform} - ${account.nickname}`);
    }
    getCollector(platform) {
        const collector = this.collectors.get(platform);
        if (!collector) {
            throw new common_1.BadRequestException(`不支持的平台数据采集: ${platform}`);
        }
        return collector;
    }
    async collectAccountData(accountId, type = 'daily') {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
        });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        const collector = this.getCollector(account.platform);
        switch (type) {
            case 'account':
                return collector.collectAccountMetrics(accountId);
            case 'content':
                return collector.collectContentMetrics(accountId);
            case 'daily':
                return collector.collectDailyMetrics(accountId);
        }
    }
    async batchCollectData(accountIds, type = 'daily') {
        const results = [];
        for (const accountId of accountIds) {
            try {
                const result = await this.collectAccountData(accountId, type);
                results.push({
                    accountId,
                    success: result.success,
                    error: result.error,
                });
            }
            catch (error) {
                results.push({
                    accountId,
                    success: false,
                    error: error.message,
                });
            }
        }
        const successCount = results.filter((r) => r.success).length;
        this.logger.log(`批量采集完成: ${successCount}/${accountIds.length} 成功`);
        return {
            total: accountIds.length,
            success: successCount,
            failed: accountIds.length - successCount,
            results,
        };
    }
    async refreshToken(accountId) {
        return this.oauthService.refreshAccountToken(accountId);
    }
    async refreshExpiringTokens() {
        return this.oauthService.refreshExpiringTokens();
    }
    async reportMetrics(userId, accountId, metrics) {
        const account = await this.prisma.account.findFirst({
            where: { id: accountId, userId: userId }
        });
        if (!account) throw new common_1.NotFoundException('Account not found');

        await this.prisma.account.update({
            where: { id: accountId },
            data: {
                followers: metrics.followers || account.followers,
                following: metrics.following || account.following
            }
        });

        const today = new Date();
        today.setHours(0,0,0,0);

        await this.prisma.dailyStats.upsert({
            where: { accountId_date: { accountId, date: today } },
            create: {
                accountId,
                platform: account.platform,
                date: today,
                followers: metrics.followers || 0,
                views: metrics.views || 0,
                likes: metrics.likes || 0,
                comments: metrics.comments || 0,
                shares: metrics.shares || 0
            },
            update: {
                followers: metrics.followers || 0,
                views: metrics.views || 0,
                likes: metrics.likes || 0,
                comments: metrics.comments || 0,
                shares: metrics.shares || 0
            }
        });

        return { success: true };
    }
    async getAuthorizedAccounts(params) {
        const { userId, teamId, platform, skip = 0, take = 20 } = params;
        const where = { status: 'ACTIVE' };
        if (userId)
            where.userId = userId;
        if (teamId)
            where.teamId = teamId;
        if (platform)
            where.platform = platform;
        const [accounts, total] = await Promise.all([
            this.prisma.account.findMany({
                where,
                skip,
                take,
                select: {
                    id: true,
                    platform: true,
                    platformUserId: true,
                    nickname: true,
                    avatar: true,
                    bio: true,
                    cookies: true,
                    followers: true,
                    following: true,
                    status: true,
                    lastActiveAt: true,
                    createdAt: true,
                    owner: { select: { id: true, name: true } },
                    team: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.account.count({ where }),
        ]);
        const accountsWithTokenStatus = accounts.map((account) => {
            const metadata = account.metadata;
            const tokenExpiresAt = metadata?.tokenExpiresAt;
            let tokenStatus = 'unknown';
            if (tokenExpiresAt) {
                const expiresAt = new Date(tokenExpiresAt).getTime();
                if (Date.now() >= expiresAt) {
                    tokenStatus = 'expired';
                }
                else if (Date.now() >= expiresAt - 3 * 24 * 60 * 60 * 1000) {
                    tokenStatus = 'expiring_soon';
                }
                else {
                    tokenStatus = 'valid';
                }
            }
            return {
                ...account,
                tokenStatus,
                hasOAuth: !!metadata?.oauthToken,
            };
        });
        return {
            accounts: accountsWithTokenStatus,
            total,
            skip,
            take,
        };
    }
};
exports.PlatformsService = PlatformsService;
exports.PlatformsService = PlatformsService = PlatformsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        oauth_service_1.OAuthService,
        douyin_collector_1.DouyinCollector,
        kuaishou_collector_1.KuaishouCollector,
        xiaohongshu_collector_1.XiaohongshuCollector,
        shipinhao_collector_1.ShipinhaoCollector,
        bilibili_collector_1.BilibiliCollector,
        weibo_collector_1.WeiboCollector])
], PlatformsService);
//# sourceMappingURL=platforms.service.js.map