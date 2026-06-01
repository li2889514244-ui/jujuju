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
var ToolRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolRegistry = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const accounts_service_1 = require("../../accounts/accounts.service");
const analytics_service_1 = require("../../analytics/analytics.service");
const content_service_1 = require("../../content/content.service");
let ToolRegistry = ToolRegistry_1 = class ToolRegistry {
    constructor(prisma, accountsService, analyticsService, contentService) {
        this.prisma = prisma;
        this.accountsService = accountsService;
        this.analyticsService = analyticsService;
        this.contentService = contentService;
        this.logger = new common_1.Logger(ToolRegistry_1.name);
        this.tools = new Map();
        this.handlers = new Map();
        this.registerAll();
    }
    getDefinitions() {
        return Array.from(this.tools.values());
    }
    async execute(tool, userId) {
        const handler = this.handlers.get(tool.name);
        if (!handler)
            return { success: false, error: `Unknown tool: ${tool.name}` };
        try {
            return await handler(tool.arguments, userId);
        }
        catch (e) {
            this.logger.error(`Tool ${tool.name} failed: ${e.message}`);
            return { success: false, error: e.message };
        }
    }
    registerAll() {
        this.register({
            name: 'list_accounts',
            description: '列出当前用户的所有平台账号，包含昵称、平台、粉丝数、状态、cookie 是否有效',
            inputSchema: {
                type: 'object',
                properties: {
                    platform: { type: 'string', description: '可选，按平台筛选：DOUYIN/KUAISHOU/XIAOHONGSHU/BILIBILI/WEIBO/WECHAT_VIDEO' },
                    groupId: { type: 'string', description: '可选，按分组ID筛选' },
                },
            },
        }, async (args, userId) => {
            const result = await this.accountsService.findAll({
                userId,
                platform: args.platform,
                groupId: args.groupId,
                take: 100,
            });
            return { success: true, data: result };
        });
        this.register({
            name: 'get_account_detail',
            description: '获取单个账号的详细信息，包括近期内容列表',
            inputSchema: {
                type: 'object',
                properties: { accountId: { type: 'string', description: '账号ID' } },
            },
        }, async (args, userId) => {
            const account = await this.accountsService.findById(args.accountId, userId);
            return { success: true, data: account };
        });
        this.register({
            name: 'check_cookie_status',
            description: '检查所有账号的 cookie 状态，返回哪些过期、哪些即将过期',
            inputSchema: {
                type: 'object',
                properties: {},
            },
        }, async (_args, userId) => {
            const accounts = await this.prisma.account.findMany({
                where: { userId },
                select: { id: true, nickname: true, platform: true, status: true, lastActiveAt: true, cookies: false },
            });
            const now = new Date();
            const result = accounts.map((a) => {
                const hoursSinceActive = a.lastActiveAt
                    ? Math.round((now.getTime() - new Date(a.lastActiveAt).getTime()) / 3600000)
                    : 999;
                let freshness = 'fresh';
                if (hoursSinceActive > 48)
                    freshness = 'expired';
                else if (hoursSinceActive > 12)
                    freshness = 'expiring_soon';
                return { ...a, cookieFreshness: freshness, hoursSinceActive };
            });
            return { success: true, data: result };
        });
        this.register({
            name: 'list_account_groups',
            description: '列出所有账号分组',
            inputSchema: { type: 'object', properties: {} },
        }, async (_args, userId) => {
            const groups = await this.prisma.accountGroup.findMany({
                where: { userId },
                include: { _count: { select: { accounts: true } } },
            });
            return { success: true, data: groups };
        });
        this.register({
            name: 'get_dashboard_overview',
            description: '获取仪表盘概览数据：总账号数、活跃数、总粉丝、内容数、互动量汇总',
            inputSchema: { type: 'object', properties: {} },
        }, async (_args, userId) => {
            const overview = await this.analyticsService.getOverview(userId);
            return { success: true, data: overview };
        });
        this.register({
            name: 'get_account_analytics',
            description: '获取指定账号在时间范围内的每日数据：粉丝、播放、点赞、评论、分享趋势',
            inputSchema: {
                type: 'object',
                properties: {
                    accountId: { type: 'string', description: '账号ID' },
                    startDate: { type: 'string', description: '开始日期 YYYY-MM-DD，默认30天前' },
                    endDate: { type: 'string', description: '结束日期 YYYY-MM-DD，默认今天' },
                    platform: { type: 'string', description: '可选，平台筛选' },
                },
            },
        }, async (args, userId) => {
            const stats = await this.analyticsService.getDailyStats({
                accountId: args.accountId,
                startDate: args.startDate,
                endDate: args.endDate,
                platform: args.platform,
            });
            return { success: true, data: stats };
        });
        this.register({
            name: 'get_views_ranking',
            description: '获取播放量排行榜，按播放量降序排列',
            inputSchema: {
                type: 'object',
                properties: {
                    limit: { type: 'number', description: '返回条数，默认20' },
                    period: { type: 'string', description: '时间范围：week/month/all，默认all' },
                    platform: { type: 'string', description: '可选，平台筛选' },
                },
            },
        }, async (args, userId) => {
            const ranking = await this.analyticsService.getViewsRanking(userId, {
                limit: args.limit || 20,
                period: args.period || 'all',
                platform: args.platform,
            });
            return { success: true, data: ranking };
        });
        this.register({
            name: 'get_platform_comparison',
            description: '按平台对比各平台账号数、内容数、播放/点赞/评论/分享数据',
            inputSchema: { type: 'object', properties: {} },
        }, async (_args, userId) => {
            const comparison = await this.analyticsService.getPlatformComparison(userId);
            return { success: true, data: comparison };
        });
        this.register({
            name: 'generate_report',
            description: '生成指定时间范围的完整数据报表',
            inputSchema: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
                    endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
                    platform: { type: 'string', description: '可选，平台筛选' },
                },
            },
        }, async (args, userId) => {
            const report = await this.analyticsService.generateReport(userId, {
                startDate: args.startDate ? new Date(args.startDate) : undefined,
                endDate: args.endDate ? new Date(args.endDate) : undefined,
                platform: args.platform,
            });
            return { success: true, data: report };
        });
        this.register({
            name: 'list_content',
            description: '列出内容列表，可按状态筛选（DRAFT/PUBLISHED/SCHEDULED/FAILED）',
            inputSchema: {
                type: 'object',
                properties: {
                    status: { type: 'string', description: '内容状态：DRAFT/PUBLISHED/SCHEDULED/FAILED' },
                    accountId: { type: 'string', description: '可选，按账号筛选' },
                },
            },
        }, async (args, userId) => {
            const accounts = await this.prisma.account.findMany({
                where: { userId },
                select: { id: true },
            });
            const accountIds = accounts.map((a) => a.id);
            const where = { accountId: { in: accountIds } };
            if (args.status)
                where.status = args.status;
            if (args.accountId)
                where.accountId = args.accountId;
            const posts = await this.prisma.post.findMany({
                where,
                include: {
                    account: { select: { nickname: true, platform: true } },
                    stats: true,
                },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });
            return { success: true, data: posts };
        });
        this.register({
            name: 'create_content',
            description: '创建一条新内容（草稿状态）。可指定标题、正文、标签、目标账号',
            inputSchema: {
                type: 'object',
                required: ['title', 'accountId'],
                properties: {
                    title: { type: 'string', description: '内容标题' },
                    content: { type: 'string', description: '正文/描述' },
                    tags: { type: 'string', description: '标签，逗号分隔，如 "美食,教程,家常菜"' },
                    accountId: { type: 'string', description: '目标账号ID' },
                    mediaUrls: { type: 'string', description: '媒体文件URL，逗号分隔' },
                },
            },
        }, async (args, userId) => {
            const post = await this.prisma.post.create({
                data: {
                    title: args.title,
                    content: args.content || '',
                    tags: args.tags || '',
                    status: 'DRAFT',
                    accountId: args.accountId,
                    mediaUrls: args.mediaUrls || null,
                },
            });
            return { success: true, data: post };
        });
        this.register({
            name: 'get_content_calendar',
            description: '获取内容日历，按日期查看排期内容',
            inputSchema: {
                type: 'object',
                properties: {
                    startDate: { type: 'string', description: '开始日期 YYYY-MM-DD' },
                    endDate: { type: 'string', description: '结束日期 YYYY-MM-DD' },
                },
            },
        }, async (args, userId) => {
            const accounts = await this.prisma.account.findMany({
                where: { userId },
                select: { id: true },
            });
            const accountIds = accounts.map((a) => a.id);
            const where = {
                accountId: { in: accountIds },
                status: 'SCHEDULED',
            };
            if (args.startDate || args.endDate) {
                where.publishAt = {};
                if (args.startDate)
                    where.publishAt.gte = new Date(args.startDate);
                if (args.endDate)
                    where.publishAt.lte = new Date(args.endDate);
            }
            const posts = await this.prisma.post.findMany({
                where,
                include: { account: { select: { nickname: true, platform: true } } },
                orderBy: { publishAt: 'asc' },
                take: 50,
            });
            return { success: true, data: posts };
        });
        this.register({
            name: 'get_system_status',
            description: '获取系统状态概览：总账号、活跃数、本月内容量、cookie 过期情况',
            inputSchema: { type: 'object', properties: {} },
        }, async (_args, userId) => {
            const [overview, cookieStatus] = await Promise.all([
                this.analyticsService.getOverview(userId),
                this.handlers.get('check_cookie_status')({}, userId),
            ]);
            return {
                success: true,
                data: { overview, cookieStatus: cookieStatus.data },
            };
        });
    }
    register(def, handler) {
        this.tools.set(def.name, def);
        this.handlers.set(def.name, handler);
        this.logger.log(`Tool registered: ${def.name}`);
    }
};
exports.ToolRegistry = ToolRegistry;
exports.ToolRegistry = ToolRegistry = ToolRegistry_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        accounts_service_1.AccountsService,
        analytics_service_1.AnalyticsService,
        content_service_1.ContentService])
], ToolRegistry);
//# sourceMappingURL=tool-registry.js.map