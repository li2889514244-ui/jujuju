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
        if (dto.accountId) {
            await this.verifyAccountOwnership(dto.accountId, userId, userRole);
        }
        return this.analyticsService.getDailyStats(dto);
    }
    async getPostStats(dto, userId, userRole) {
        if (dto.accountId) {
            await this.verifyAccountOwnership(dto.accountId, userId, userRole);
        }
        return this.analyticsService.getPostStats(dto);
    }
    async getPlatformComparison(userId) {
        return this.analyticsService.getPlatformComparison(userId);
    }
    async getReport(userId, startDate, endDate, platform) {
        return this.analyticsService.generateReport(userId, {
            startDate: startDate ? new Date(startDate) : undefined,
            endDate: endDate ? new Date(endDate) : undefined,
            platform,
        });
    }
    async getComparison(userId) {
        return this.analyticsService.getComparison(userId);
    }
    async getViewsRanking(userId, limit, period, platform) {
        return this.analyticsService.getViewsRanking(userId, {
            limit: limit ? Math.min(100, Math.max(1, Number(limit))) : 50,
            period: period || 'all',
            platform,
        });
    }
    async verifyAccountOwnership(accountId, userId, userRole) {
        if (['OWNER', 'ADMIN'].includes(userRole))
            return;
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
            select: { userId: true },
        });
        if (!account || account.userId !== userId) {
            throw new common_1.ForbiddenException('无权查看此账号的数据统计');
        }
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('overview'),
    (0, swagger_1.ApiOperation)({ summary: '获取数据概览' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getOverview", null);
__decorate([
    (0, common_1.Get)('daily'),
    (0, swagger_1.ApiOperation)({ summary: '获取每日统计数据' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_analytics_dto_1.QueryAnalyticsDto, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getDailyStats", null);
__decorate([
    (0, common_1.Get)('posts'),
    (0, swagger_1.ApiOperation)({ summary: '获取内容表现统计' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [query_analytics_dto_1.QueryAnalyticsDto, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getPostStats", null);
__decorate([
    (0, common_1.Get)('platforms'),
    (0, swagger_1.ApiOperation)({ summary: '获取平台维度对比数据' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getPlatformComparison", null);
__decorate([
    (0, common_1.Get)('report'),
    (0, swagger_1.ApiOperation)({ summary: '生成数据报表（JSON格式，前端可导出为Excel/PDF）' }),
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
    (0, swagger_1.ApiOperation)({ summary: '数据同比环比对比（周环比、月环比、年同比）' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getComparison", null);
__decorate([
    (0, common_1.Get)('views-ranking'),
    (0, swagger_1.ApiOperation)({ summary: '播放量榜单（按播放量排名）' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: '返回条数（默认50）' }),
    (0, swagger_1.ApiQuery)({ name: 'period', required: false, enum: ['week', 'month', 'all'], description: '时间范围' }),
    (0, swagger_1.ApiQuery)({ name: 'platform', required: false, description: '平台筛选' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('period')),
    __param(3, (0, common_1.Query)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getViewsRanking", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('analytics'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService,
        prisma_service_1.PrismaService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map