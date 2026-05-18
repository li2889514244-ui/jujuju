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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const analytics_service_1 = require("./analytics.service");
const query_analytics_dto_1 = require("./dto/query-analytics.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const prisma_service_1 = require("../../prisma/prisma.service");
let AnalyticsController = class AnalyticsController {
    constructor(analyticsService, prisma) {
        this.analyticsService = analyticsService;
        this.prisma = prisma;
    }
    async getOverview(userId) {
        return this.analyticsService.getOverview(userId);
    }
    async getDailyStats(dto, userId, userRole) {
        if (dto.accountId)
            await this.verifyAccountOwnership(dto.accountId, userId, userRole);
        return this.analyticsService.getDailyStats(dto);
    }
    async getPostStats(dto, userId, userRole) {
        if (dto.accountId)
            await this.verifyAccountOwnership(dto.accountId, userId, userRole);
        return this.analyticsService.getPostStats(dto);
    }
    async getPlatformComparison(userId) {
        return this.analyticsService.getPlatformComparison(userId);
    }
    async getReport(userId, startDate, endDate, platform) {
        return this.analyticsService.generateReport(userId, { startDate: startDate ? new Date(startDate) : undefined, endDate: endDate ? new Date(endDate) : undefined, platform });
    }
    async getComparison(userId) {
        return this.analyticsService.getComparison(userId);
    }
    async getViewsRanking(userId, limit, period, platform) {
        return this.analyticsService.getViewsRanking(userId, { limit: limit ? Math.min(100, Math.max(1, Number(limit))) : 50, period: period || 'all', platform });
    }
    async getFollowerTrend(userId, days, platform) {
        return this.analyticsService.getFollowerTrend(userId, days || 7, platform);
    }
    async getLikesTrend(userId, days, platform) {
        return this.analyticsService.getLikesTrend(userId, days || 7, platform);
    }
    async getPublishEffect(userId, days, contentId) {
        return this.analyticsService.getPublishEffect(userId, days, contentId);
    }
    async getEngagementRate(userId, days, platform) {
        return this.analyticsService.getEngagementRate(userId, days || 7, platform);
    }
    async exportReport(userId, startDate, endDate, format) {
        return this.analyticsService.exportReport(userId, startDate, endDate, format);
    }
    async collectStats(userId) {
        return this.analyticsService.collectStats(userId);
    }
    async getAccountAnalytics(accountId, userId, userRole) {
        await this.verifyAccountOwnership(accountId, userId, userRole);
        return this.analyticsService.getAccountAnalytics(accountId);
    }
    async getAccountPosts(accountId, userId, userRole, page, pageSize, sortBy, sortOrder) {
        await this.verifyAccountOwnership(accountId, userId, userRole);
        return this.analyticsService.getAccountPosts(accountId, {
            page: page ? Number(page) : 1,
            pageSize: pageSize ? Math.min(100, Number(pageSize)) : 20,
            sortBy: sortBy || 'createdAt',
            sortOrder: sortOrder || 'desc',
        });
    }
    async verifyAccountOwnership(accountId, userId, userRole) {
        if (['OWNER', 'ADMIN'].includes(userRole))
            return;
        const account = await this.prisma.account.findUnique({ where: { id: accountId }, select: { userId: true } });
        if (!account)
            throw new common_1.ForbiddenException('账号不存在');
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('overview'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getOverview", null);
__decorate([
    (0, common_1.Get)('daily'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_analytics_dto_1.QueryAnalyticsDto, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getDailyStats", null);
__decorate([
    (0, common_1.Get)('posts'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_analytics_dto_1.QueryAnalyticsDto, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getPostStats", null);
__decorate([
    (0, common_1.Get)('platforms'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getPlatformComparison", null);
__decorate([
    (0, common_1.Get)('report'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __param(3, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getReport", null);
__decorate([
    (0, common_1.Get)('comparison'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getComparison", null);
__decorate([
    (0, common_1.Get)('views-ranking'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('period')),
    __param(3, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getViewsRanking", null);
__decorate([
    (0, common_1.Get)('followers/trend'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('days')),
    __param(2, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getFollowerTrend", null);
__decorate([
    (0, common_1.Get)('likes/trend'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('days')),
    __param(2, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getLikesTrend", null);
__decorate([
    (0, common_1.Get)('publish-effect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('days')),
    __param(2, (0, common_1.Query)('contentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getPublishEffect", null);
__decorate([
    (0, common_1.Get)('engagement'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('days')),
    __param(2, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getEngagementRate", null);
__decorate([
    (0, common_1.Get)('export'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('startDate')),
    __param(2, (0, common_1.Query)('endDate')),
    __param(3, (0, common_1.Query)('format')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "exportReport", null);
__decorate([
    (0, common_1.Post)('collect'),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "collectStats", null);
__decorate([
    (0, common_1.Get)('account/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getAccountAnalytics", null);
__decorate([
    (0, common_1.Get)('account/:id/posts'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('role')),
    __param(3, (0, common_1.Query)('page')),
    __param(4, (0, common_1.Query)('pageSize')),
    __param(5, (0, common_1.Query)('sortBy')),
    __param(6, (0, common_1.Query)('sortOrder')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getAccountPosts", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('analytics'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService, typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object])
], AnalyticsController);
