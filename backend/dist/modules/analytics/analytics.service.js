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
var AnalyticsService_1;
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
// Simple in-memory cache fallback
var _cache = new Map();

async function cacheGet(key) {
    try {
        var Redis = require("ioredis");
        var client = new Redis({ host: "127.0.0.1", port: 6379, password: "2b6bdc40a4bfc4ff9575326d", maxRetriesPerRequest: 1, lazyConnect: true });
        await client.connect();
        var val = await client.get(key);
        await client.quit();
        return val ? JSON.parse(val) : null;
    } catch(e) {
        var entry = _cache.get(key);
        if (entry && entry.exp > Date.now()) return entry.val;
        return null;
    }
}

async function cacheSet(key, val, ttl) {
    ttl = ttl || 300;
    try {
        var Redis = require("ioredis");
        var client = new Redis({ host: "127.0.0.1", port: 6379, password: "2b6bdc40a4bfc4ff9575326d", maxRetriesPerRequest: 1, lazyConnect: true });
        await client.connect();
        await client.setex(key, ttl, JSON.stringify(val));
        await client.quit();
    } catch(e) {
        _cache.set(key, { val: val, exp: Date.now() + ttl * 1000 });
    }
}


let AnalyticsService = AnalyticsService_1 = class AnalyticsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AnalyticsService_1.name);
    }
    async getDailyStats(dto) {
        const where = {};
        if (dto.accountId)
            where.accountId = dto.accountId;
        if (dto.platform)
            where.platform = dto.platform;
        if (dto.startDate || dto.endDate) {
            where.date = {};
            if (dto.startDate)
                where.date.gte = new Date(dto.startDate);
            if (dto.endDate)
                where.date.lte = new Date(dto.endDate);
        }
        return this.prisma.dailyStats.findMany({ where, orderBy: { date: 'asc' }, include: { account: { select: { id: true, platform: true, nickname: true } } } });
    }
    async getPostStats(dto) {
        const where = {};
        if (dto.accountId || dto.platform) {
            where.post = {};
            if (dto.accountId)
                where.post.accountId = dto.accountId;
            if (dto.platform)
                where.post.account = { platform: dto.platform };
        }
        return this.prisma.postStats.findMany({ where, include: { post: { select: { id: true, title: true, status: true, platformUrl: true, account: { select: { id: true, platform: true, nickname: true } } } } }, orderBy: { collectedAt: 'desc' } });
    }
    async getOverview(userId) {
        var cacheKey = 'cache:analytics:overview:' + userId;
        var cached = await cacheGet(cacheKey);
        if (cached) return cached;
        const accounts = await this.prisma.account.findMany({ where: { userId }, select: { id: true, platform: true, followers: true, status: true } });
        const accountIds = accounts.map(a => a.id);
        const [totalPosts, publishedPosts, failedPosts] = await Promise.all([
            this.prisma.post.count({ where: { accountId: { in: accountIds } } }),
            this.prisma.post.count({ where: { accountId: { in: accountIds }, status: 'PUBLISHED' } }),
            this.prisma.post.count({ where: { accountId: { in: accountIds }, status: 'FAILED' } }),
        ]);
        const statsAgg = await this.prisma.postStats.aggregate({ where: { post: { accountId: { in: accountIds } } }, _sum: { views: true, likes: true, comments: true, shares: true, saves: true } });
        const platformCounts = {};
        accounts.forEach(a => { platformCounts[a.platform] = (platformCounts[a.platform] || 0) + 1; });
        const totalFollowers = accounts.reduce((sum, a) => sum + a.followers, 0);
        var result = { accounts: { total: accounts.length, active: accounts.filter(a => a.status === 'ACTIVE').length, byPlatform: platformCounts, totalFollowers }, posts: { total: totalPosts, published: publishedPosts, failed: failedPosts }, engagement: { totalViews: statsAgg._sum.views || 0, totalLikes: statsAgg._sum.likes || 0, totalComments: statsAgg._sum.comments || 0, totalShares: statsAgg._sum.shares || 0, totalSaves: statsAgg._sum.saves || 0 } };
        await cacheSet(cacheKey, result, 300);
        return result;
    }
    async getPlatformComparison(userId) {
        const accounts = await this.prisma.account.findMany({ where: { userId }, select: { id: true, platform: true } });
        const platforms = [...new Set(accounts.map(a => a.platform))];
        const result = {};
        for (const platform of platforms) {
            const ids = accounts.filter(a => a.platform === platform).map(a => a.id);
            const [postCount, statsAgg] = await Promise.all([
                this.prisma.post.count({ where: { accountId: { in: ids }, status: 'PUBLISHED' } }),
                this.prisma.postStats.aggregate({ where: { post: { accountId: { in: ids } } }, _sum: { views: true, likes: true, comments: true, shares: true } }),
            ]);
            result[platform] = { accountCount: ids.length, publishedPosts: postCount, views: statsAgg._sum.views || 0, likes: statsAgg._sum.likes || 0, comments: statsAgg._sum.comments || 0, shares: statsAgg._sum.shares || 0 };
        }
        return result;
    }
    async generateReport(userId, params) {
        const { startDate, endDate, platform } = params;
        const end = endDate || new Date();
        const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        const accounts = await this.prisma.account.findMany({ where: { userId, ...(platform ? { platform: platform } : {}) }, select: { id: true, platform: true, nickname: true, followers: true } });
        const accountIds = accounts.map(a => a.id);
        const dailyStats = await this.prisma.dailyStats.findMany({ where: { accountId: { in: accountIds }, date: { gte: start, lte: end } }, orderBy: { date: 'asc' }, include: { account: { select: { nickname: true, platform: true } } } });
        const topPosts = await this.prisma.post.findMany({ where: { accountId: { in: accountIds }, status: 'PUBLISHED', createdAt: { gte: start, lte: end } }, include: { stats: true, account: { select: { nickname: true, platform: true } } }, orderBy: { stats: { views: 'desc' } }, take: 10 });
        const overview = await this.getOverview(userId);
        return { period: { start, end }, overview, accounts: accounts.map(a => ({ ...a, dailyStats: dailyStats.filter(d => d.accountId === a.id) })), topPosts: topPosts.map(p => ({ id: p.id, title: p.title, platform: p.account.platform, account: p.account.nickname, views: p.stats?.views || 0, likes: p.stats?.likes || 0, comments: p.stats?.comments || 0, shares: p.stats?.shares || 0, publishedAt: p.updatedAt })), dailyTrend: dailyStats };
    }
    async getComparison(userId) {
        const accounts = await this.prisma.account.findMany({ where: { userId }, select: { id: true } });
        const accountIds = accounts.map(a => a.id);
        const now = new Date();
        const thisWeekStart = this.getWeekStart(now);
        const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);
        const lastYearSameMonthStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
        const lastYearSameMonthEnd = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
        const [thisWeek, lastWeek, thisMonth, lastMonth, lastYearSameMonth] = await Promise.all([
            this.aggregateStats(accountIds, thisWeekStart, now), this.aggregateStats(accountIds, lastWeekStart, lastWeekEnd),
            this.aggregateStats(accountIds, thisMonthStart, now), this.aggregateStats(accountIds, lastMonthStart, lastMonthEnd),
            this.aggregateStats(accountIds, lastYearSameMonthStart, lastYearSameMonthEnd),
        ]);
        return { weekOverWeek: { current: thisWeek, previous: lastWeek, change: this.calcChange(thisWeek, lastWeek) }, monthOverMonth: { current: thisMonth, previous: lastMonth, change: this.calcChange(thisMonth, lastMonth) }, yearOverYear: { current: thisMonth, previous: lastYearSameMonth, change: this.calcChange(thisMonth, lastYearSameMonth) } };
    }
    async getViewsRanking(userId, params) {
        const { limit = 50, period = 'all', platform } = params;
        const accounts = await this.prisma.account.findMany({ where: { userId, ...(platform ? { platform: platform } : {}) }, select: { id: true } });
        const accountIds = accounts.map(a => a.id);
        let dateFilter = {};
        const now = new Date();
        if (period === 'week')
            dateFilter = { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } };
        else if (period === 'month')
            dateFilter = { createdAt: { gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } };
        const posts = await this.prisma.post.findMany({ where: { accountId: { in: accountIds }, status: 'PUBLISHED', stats: { isNot: null }, ...dateFilter }, include: { stats: true, account: { select: { id: true, nickname: true, platform: true, avatar: true } } }, orderBy: { stats: { views: 'desc' } }, take: limit });
        return { ranking: posts.map((p, i) => ({ rank: i + 1, postId: p.id, title: p.title, platform: p.account.platform, accountName: p.account.nickname, accountAvatar: p.account.avatar, views: p.stats?.views || 0, likes: p.stats?.likes || 0, comments: p.stats?.comments || 0, shares: p.stats?.shares || 0, publishedAt: p.updatedAt })), total: posts.length, period };
    }
    async getFollowerTrend(userId, days = 7, platform) {
        const accounts = await this.prisma.account.findMany({ where: { userId, ...(platform ? { platform: platform } : {}) }, select: { id: true } });
        const accountIds = accounts.map(a => a.id);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const stats = await this.prisma.dailyStats.findMany({ where: { accountId: { in: accountIds }, date: { gte: startDate } }, orderBy: { date: 'asc' }, select: { date: true, followers: true } });
        const byDate = {};
        for (const s of stats) {
            const d = s.date.toISOString().slice(0, 10);
            if (!byDate[d])
                byDate[d] = { date: d, value: 0 };
            byDate[d].value += s.followers;
        }
        return Object.values(byDate);
    }
    async getLikesTrend(userId, days = 7, platform) {
        const accounts = await this.prisma.account.findMany({ where: { userId, ...(platform ? { platform: platform } : {}) }, select: { id: true } });
        const accountIds = accounts.map(a => a.id);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const stats = await this.prisma.dailyStats.findMany({ where: { accountId: { in: accountIds }, date: { gte: startDate } }, orderBy: { date: 'asc' }, select: { date: true, likes: true } });
        const byDate = {};
        for (const s of stats) {
            const d = s.date.toISOString().slice(0, 10);
            if (!byDate[d])
                byDate[d] = { date: d, value: 0 };
            byDate[d].value += s.likes;
        }
        return Object.values(byDate);
    }
    async getPublishEffect(userId, days, contentId) {
        const accounts = await this.prisma.account.findMany({ where: { userId }, select: { id: true } });
        const accountIds = accounts.map(a => a.id);
        const where = { accountId: { in: accountIds } };
        if (contentId)
            where.id = contentId;
        if (days)
            where.createdAt = { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
        const posts = await this.prisma.post.findMany({ where, include: { stats: true, account: { select: { nickname: true, platform: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
        return posts.map(p => ({ id: p.id, title: p.title, platform: p.account.platform, accountName: p.account.nickname, status: p.status, views: p.stats?.views || 0, likes: p.stats?.likes || 0, comments: p.stats?.comments || 0, shares: p.stats?.shares || 0, publishedAt: p.publishAt || p.createdAt }));
    }
    async getEngagementRate(userId, days = 7, platform) {
        const accounts = await this.prisma.account.findMany({ where: { userId, ...(platform ? { platform: platform } : {}) }, select: { id: true } });
        const accountIds = accounts.map(a => a.id);
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const stats = await this.prisma.dailyStats.findMany({ where: { accountId: { in: accountIds }, date: { gte: startDate } }, orderBy: { date: 'asc' }, select: { date: true, views: true, likes: true, comments: true, shares: true } });
        const byDate = {};
        for (const s of stats) {
            const d = s.date.toISOString().slice(0, 10);
            if (!byDate[d])
                byDate[d] = { date: d, views: 0, likes: 0, comments: 0, shares: 0 };
            byDate[d].views += s.views;
            byDate[d].likes += s.likes;
            byDate[d].comments += s.comments;
            byDate[d].shares += s.shares;
        }
        return Object.values(byDate).map((d) => ({ date: d.date, value: d.views > 0 ? Math.round(((d.likes + d.comments + d.shares) / d.views) * 10000) / 100 : 0 }));
    }
    async exportReport(userId, startDate, endDate, format) {
        const report = await this.generateReport(userId, { startDate: new Date(startDate), endDate: new Date(endDate) });
        if (format === 'csv') {
            const headers = 'date,platform,account,views,likes,comments,shares,followers';
            const rows = (report.dailyTrend || []).map((d) => `${d.date},${d.account?.platform || ''},${d.account?.nickname || ''},${d.views || 0},${d.likes || 0},${d.comments || 0},${d.shares || 0},${d.followers || 0}`);
            return [headers, ...rows].join('\n');
        }
        return report;
    }
    async aggregateStats(accountIds, start, end) {
        if (accountIds.length === 0)
            return { views: 0, likes: 0, comments: 0, shares: 0, followers: 0, posts: 0 };
        const [dailyAgg, postCount] = await Promise.all([
            this.prisma.dailyStats.aggregate({ where: { accountId: { in: accountIds }, date: { gte: start, lte: end } }, _sum: { views: true, likes: true, comments: true, shares: true } }),
            this.prisma.post.count({ where: { accountId: { in: accountIds }, status: 'PUBLISHED', updatedAt: { gte: start, lte: end } } }),
        ]);
        const [latestFollowers, earliestFollowers] = await Promise.all([
            this.prisma.dailyStats.findFirst({ where: { accountId: { in: accountIds }, date: { lte: end } }, orderBy: { date: 'desc' }, select: { followers: true } }),
            this.prisma.dailyStats.findFirst({ where: { accountId: { in: accountIds }, date: { gte: start } }, orderBy: { date: 'asc' }, select: { followers: true } }),
        ]);
        const followerGrowth = (latestFollowers?.followers || 0) - (earliestFollowers?.followers || 0);
        return { views: dailyAgg._sum.views || 0, likes: dailyAgg._sum.likes || 0, comments: dailyAgg._sum.comments || 0, shares: dailyAgg._sum.shares || 0, followers: Math.max(0, followerGrowth), posts: postCount };
    }
    calcChange(current, previous) {
        const result = {};
        for (const key of Object.keys(current)) {
            const cur = current[key] || 0;
            const prev = previous[key] || 0;
            if (prev === 0)
                result[key] = cur > 0 ? 100 : 0;
            else
                result[key] = Math.round(((cur - prev) / prev) * 100);
        }
        return result;
    }
    getWeekStart(date) {
        const utc8Offset = 8 * 60 * 60 * 1000;
        const localTime = new Date(date.getTime() + utc8Offset);
        const day = localTime.getUTCDay();
        const diff = localTime.getUTCDate() - day + (day === 0 ? -6 : 1);
        localTime.setUTCDate(diff);
        localTime.setUTCHours(0, 0, 0, 0);
        return new Date(localTime.getTime() - utc8Offset);
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = AnalyticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], AnalyticsService);
