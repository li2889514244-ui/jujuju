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
        const metadata = (account.metadata || '{}');
        const { oauthToken, tokenExpiresAt, scope, ...restMetadata } = metadata || {};
        await this.prisma.account.update({
            where: { id: accountId },
            data: {
                metadata: restMetadata,
                status: 'DISABLED',
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
    async reportMetrics(dto) {
        const { accountId, metrics, date } = dto;
        const account = await this.prisma.account.findUnique({ where: { id: accountId } });
        if (!account) {
            this.logger.warn(`reportMetrics: account ${accountId} not found`);
            return { success: false, error: 'Account not found' };
        }
        let targetDate;
        if (date) {
            targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);
        }
        else {
            targetDate = new Date();
            targetDate.setHours(0, 0, 0, 0);
        }
        const platform = account.platform;
        try {
            const pickNumber = (value) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
            const statData = {
                followers: pickNumber(metrics.followers),
                views: pickNumber(metrics.views),
                likes: pickNumber(metrics.likes),
                comments: pickNumber(metrics.comments),
                shares: pickNumber(metrics.shares),
                revenue: pickNumber(metrics.revenue),
                gmv: pickNumber(metrics.gmv),
                orders: pickNumber(metrics.orders),
                commission: pickNumber(metrics.commission),
                buyerCount: pickNumber(metrics.buyerCount),
                productCount: pickNumber(metrics.productCount),
                avgOrderValue: pickNumber(metrics.avgOrderValue),
                followersIncrement: pickNumber(metrics.newFollowers),
                viewsIncrement: pickNumber(metrics.newViews),
                likesIncrement: pickNumber(metrics.newLikes),
                commentsIncrement: pickNumber(metrics.newComments),
                sharesIncrement: pickNumber(metrics.newShares),
                unfollows: pickNumber(metrics.unfollows),
            };
            const hasAnyIncrement = (statData.followersIncrement !== undefined ||
                statData.viewsIncrement !== undefined ||
                statData.likesIncrement !== undefined ||
                statData.commentsIncrement !== undefined ||
                statData.sharesIncrement !== undefined);
            if (!hasAnyIncrement) {
                const yesterdayDate = new Date(targetDate);
                yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                const yesterdayStats = await this.prisma.dailyStats.findUnique({
                    where: { accountId_date: { accountId, date: yesterdayDate } },
                    select: { followers: true, views: true, likes: true, comments: true, shares: true },
                });
                if (yesterdayStats) {
                    const diff = (today, prev) => {
                        if (today === undefined || today === null)
                            return 0;
                        return Math.max(0, today - (prev ?? 0));
                    };
                    statData.followersIncrement = diff(statData.followers, yesterdayStats.followers);
                    statData.viewsIncrement = diff(statData.views, yesterdayStats.views);
                    statData.likesIncrement = diff(statData.likes, yesterdayStats.likes);
                    statData.commentsIncrement = diff(statData.comments, yesterdayStats.comments);
                    statData.sharesIncrement = diff(statData.shares, yesterdayStats.shares);
                    this.logger.log(`reportMetrics: auto-computed increments account=${accountId} ` +
                        `followers+${statData.followersIncrement} views+${statData.viewsIncrement} ` +
                        `likes+${statData.likesIncrement} comments+${statData.commentsIncrement} shares+${statData.sharesIncrement}`);
                }
                else {
                    this.logger.debug(`reportMetrics: no yesterday stats for ${accountId}, increments stay 0 (first collection)`);
                }
            }
            const statUpdateData = Object.fromEntries(Object.entries(statData).filter(([, value]) => value !== undefined));
            const statCreateData = Object.fromEntries(Object.entries(statData).map(([key, value]) => [key, value ?? 0]));
            await this.prisma.dailyStats.upsert({
                where: { accountId_date: { accountId, date: targetDate } },
                update: statUpdateData,
                create: { accountId, platform, date: targetDate, ...statCreateData },
            });
            const accountUpdates = {};
            if (metrics.followers && metrics.followers > 0)
                accountUpdates.followers = metrics.followers;
            if (metrics.likes && metrics.likes > 0)
                accountUpdates.likes = metrics.likes;
            if (metrics.following !== undefined)
                accountUpdates.following = metrics.following;
            const nickname = metrics._nickname;
            if (nickname && typeof nickname === 'string' && nickname.length >= 2)
                accountUpdates.nickname = nickname;
            const avatar = metrics._avatar;
            if (avatar && typeof avatar === 'string')
                accountUpdates.avatar = avatar;
            if (metrics.storeScore !== undefined)
                accountUpdates.storeScore = metrics.storeScore;
            if (metrics.storeDiagnosis !== undefined)
                accountUpdates.storeDiagnosis = metrics.storeDiagnosis;
            if (Object.keys(accountUpdates).length > 0) {
                await this.prisma.account.update({
                    where: { id: accountId },
                    data: accountUpdates,
                });
            }
            this.logger.log(`reportMetrics: ${accountId} followers=${metrics.followers} views=${metrics.views} revenue=${metrics.revenue}`);
            return { success: true };
        }
        catch (e) {
            this.logger.error(`reportMetrics error: ${e.message}`);
            return { success: false, error: e.message };
        }
    }
    parseReportedPostDate(value) {
        if (typeof value === 'number') {
            const seconds = value > 1e12 ? value / 1000 : value;
            const d = new Date(seconds * 1000);
            if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000)
                return d;
            return undefined;
        }
        if (typeof value === 'string' && /^\d{9,13}$/.test(value.trim())) {
            const num = Number(value.trim());
            const seconds = num > 1e12 ? num / 1000 : num;
            const d = new Date(seconds * 1000);
            if (!Number.isNaN(d.getTime()) && d.getFullYear() > 2000)
                return d;
            return undefined;
        }
        if (typeof value !== 'string' || !value.trim())
            return undefined;
        const raw = value.trim();
        const direct = new Date(raw);
        if (!Number.isNaN(direct.getTime()))
            return direct;
        const match = raw.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
        if (!match)
            return undefined;
        const [, year, month, day] = match;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }
    async reportPostStats(dto) {
        const { accountId, posts } = dto;
        const account = await this.prisma.account.findUnique({ where: { id: accountId } });
        if (!account) {
            this.logger.warn(`reportPostStats: account ${accountId} not found`);
            return { success: false, error: 'Account not found' };
        }
        let created = 0;
        let updated = 0;
        for (const p of posts) {
            try {
                const title = p.title || '';
                const publishAt = this.parseReportedPostDate(p.publishedAt || p.date);
                const postId = `${accountId}_${title.substring(0, 40)}`;
                const existing = await this.prisma.post.findFirst({
                    where: { accountId, title },
                });
                let post;
                if (existing) {
                    post = existing;
                    const postUpdates = {};
                    if (p.coverUrl)
                        postUpdates.coverUrl = p.coverUrl;
                    if (publishAt && !existing.publishAt)
                        postUpdates.publishAt = publishAt;
                    if (Object.keys(postUpdates).length > 0) {
                        post = await this.prisma.post.update({
                            where: { id: existing.id },
                            data: postUpdates,
                        });
                    }
                    updated++;
                }
                else {
                    post = await this.prisma.post.create({
                        data: {
                            accountId,
                            title,
                            status: 'PUBLISHED',
                            coverUrl: p.coverUrl,
                            publishAt,
                        },
                    });
                    created++;
                }
                await this.prisma.postStats.upsert({
                    where: { postId: post.id },
                    update: {
                        views: p.views || 0,
                        likes: p.likes || 0,
                        comments: p.comments || 0,
                        shares: p.shares || 0,
                        saves: p.saves || 0,
                        completionRate: p.completionRate || 0,
                        fiveSecCompletionRate: p.fiveSecCompletionRate || 0,
                        coverClickRate: p.coverClickRate || 0,
                        avgPlayDuration: p.avgPlayDuration || 0,
                        videoDuration: p.videoDuration || 0,
                        danmakuCount: p.danmakuCount || 0,
                        dislikes: p.dislikes || 0,
                        followsFromPost: p.followsFromPost || 0,
                        collectedAt: new Date(),
                    },
                    create: {
                        postId: post.id,
                        views: p.views || 0,
                        likes: p.likes || 0,
                        comments: p.comments || 0,
                        shares: p.shares || 0,
                        saves: p.saves || 0,
                        completionRate: p.completionRate || 0,
                        fiveSecCompletionRate: p.fiveSecCompletionRate || 0,
                        coverClickRate: p.coverClickRate || 0,
                        avgPlayDuration: p.avgPlayDuration || 0,
                        videoDuration: p.videoDuration || 0,
                        danmakuCount: p.danmakuCount || 0,
                        dislikes: p.dislikes || 0,
                        followsFromPost: p.followsFromPost || 0,
                    },
                });
            }
            catch (e) {
                this.logger.warn(`reportPostStats item error: ${e.message}`);
            }
        }
        this.logger.log(`reportPostStats: ${accountId} created=${created} updated=${updated}`);
        return { success: true, created, updated, total: posts.length };
    }
    async refreshToken(accountId) {
        return this.oauthService.refreshAccountToken(accountId);
    }
    async refreshExpiringTokens() {
        return this.oauthService.refreshExpiringTokens();
    }
    async getAuthorizedAccounts(params) {
        const { userId, teamId, platform, skip = 0, take = 20 } = params;
        const where = { status: 'ACTIVE' };
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
                    followers: true,
                    likes: true,
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