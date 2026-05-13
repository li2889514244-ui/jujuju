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
var XiaohongshuCollector_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.XiaohongshuCollector = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const xiaohongshu_client_1 = require("../clients/xiaohongshu.client");
const oauth_service_1 = require("../oauth/oauth.service");
let XiaohongshuCollector = XiaohongshuCollector_1 = class XiaohongshuCollector {
    constructor(prisma, oauthService) {
        this.prisma = prisma;
        this.oauthService = oauthService;
        this.platform = 'XIAOHONGSHU';
        this.logger = new common_1.Logger(XiaohongshuCollector_1.name);
    }
    async getClient(accountId) {
        const account = await this.prisma.account.findUnique({ where: { id: accountId } });
        if (!account)
            throw new Error('账号不存在');
        const client = new xiaohongshu_client_1.XiaohongshuClient();
        const metadata = account.metadata;
        if (metadata?.oauthToken) {
            const token = this.oauthService['decryptToken'](metadata.oauthToken);
            client.setToken(token);
        }
        return client;
    }
    async collectAccountMetrics(accountId) {
        try {
            const client = await this.getClient(accountId);
            const userInfo = await client.getUserInfo();
            await this.prisma.account.update({
                where: { id: accountId },
                data: {
                    followers: userInfo.followers || 0,
                    following: userInfo.following || 0,
                    nickname: userInfo.nickname,
                    avatar: userInfo.avatar,
                    lastActiveAt: new Date(),
                },
            });
            return {
                success: true,
                data: {
                    platform: this.platform,
                    platformUserId: userInfo.platformUserId,
                    nickname: userInfo.nickname,
                    followers: userInfo.followers || 0,
                    following: userInfo.following || 0,
                    totalViews: 0, totalLikes: 0, totalComments: 0, totalShares: 0,
                    collectedAt: new Date(),
                },
                collectedAt: new Date(),
            };
        }
        catch (error) {
            this.logger.error(`小红书数据采集失败: ${accountId}`, error);
            return { success: false, error: error.message, collectedAt: new Date() };
        }
    }
    async collectContentMetrics(accountId, options) {
        try {
            const client = await this.getClient(accountId);
            const noteList = await client.getNoteList(options?.cursor || '', options?.limit || 20);
            const contents = noteList.data.notes.map((note) => ({
                contentId: note.note_id,
                title: note.title,
                platform: this.platform,
                views: note.stats.view_count,
                likes: note.stats.like_count,
                comments: note.stats.comment_count,
                shares: note.stats.share_count,
                saves: note.stats.collect_count,
                createdAt: new Date(note.create_time * 1000),
                collectedAt: new Date(),
            }));
            return { success: true, data: contents, collectedAt: new Date() };
        }
        catch (error) {
            this.logger.error(`小红书内容数据采集失败: ${accountId}`, error);
            return { success: false, error: error.message, collectedAt: new Date() };
        }
    }
    async collectDailyMetrics(accountId) {
        try {
            const accountMetrics = await this.collectAccountMetrics(accountId);
            if (!accountMetrics.success || !accountMetrics.data) {
                return { success: false, error: accountMetrics.error, collectedAt: new Date() };
            }
            const contentMetrics = await this.collectContentMetrics(accountId);
            const totalViews = contentMetrics.data?.reduce((sum, c) => sum + c.views, 0) || 0;
            const totalLikes = contentMetrics.data?.reduce((sum, c) => sum + c.likes, 0) || 0;
            const totalComments = contentMetrics.data?.reduce((sum, c) => sum + c.comments, 0) || 0;
            const totalShares = contentMetrics.data?.reduce((sum, c) => sum + c.shares, 0) || 0;
            const dailyData = {
                platform: this.platform,
                platformUserId: accountMetrics.data.platformUserId,
                date: new Date(),
                followers: accountMetrics.data.followers,
                views: totalViews, likes: totalLikes, comments: totalComments, shares: totalShares,
            };
            await this.prisma.dailyStats.create({
                data: {
                    accountId, date: new Date(), platform: 'XIAOHONGSHU',
                    followers: dailyData.followers, views: dailyData.views,
                    likes: dailyData.likes, comments: dailyData.comments, shares: dailyData.shares,
                },
            });
            return { success: true, data: dailyData, collectedAt: new Date() };
        }
        catch (error) {
            this.logger.error(`小红书每日数据采集失败: ${accountId}`, error);
            return { success: false, error: error.message, collectedAt: new Date() };
        }
    }
};
exports.XiaohongshuCollector = XiaohongshuCollector;
exports.XiaohongshuCollector = XiaohongshuCollector = XiaohongshuCollector_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        oauth_service_1.OAuthService])
], XiaohongshuCollector);
//# sourceMappingURL=xiaohongshu.collector.js.map