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
exports.PlatformsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const platforms_service_1 = require("./platforms.service");
const oauth_service_1 = require("./oauth/oauth.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const platform_dto_1 = require("./dto/platform.dto");
let PlatformsController = class PlatformsController {
    constructor(platformsService, oauthService) {
        this.platformsService = platformsService;
        this.oauthService = oauthService;
    }
    async getSupportedPlatforms() {
        return this.platformsService.getSupportedPlatforms();
    }
    async getPlatformInfo(platform) {
        return this.platformsService.getPlatformInfo(platform);
    }
    async getAuthorizeUrl(dto, userId) {
        const url = this.platformsService.getAuthorizeUrl(dto.platform, userId, dto.teamId);
        return { url, platform: dto.platform };
    }
    async revokeAuthorization(accountId, userId) {
        await this.platformsService.revokeAuthorization(accountId, userId);
        return { success: true, message: '授权已解除' };
    }
    async getAuthorizedAccounts(filter, userId) {
        return this.platformsService.getAuthorizedAccounts({
            userId,
            ...filter,
            skip: filter.skip || 0,
        });
    }
    async collectAccountData(dto) {
        return this.platformsService.collectAccountData(dto.accountId, dto.type || 'daily');
    }
    async batchCollectData(dto) {
        return this.platformsService.batchCollectData(dto.accountIds, dto.type || 'daily');
    }
    async refreshToken(accountId) {
        const success = await this.platformsService.refreshToken(accountId);
        return {
            success,
            message: success ? 'Token刷新成功' : 'Token刷新失败',
        };
    }
    async refreshExpiringTokens() {
        return this.platformsService.refreshExpiringTokens();
    }
};
exports.PlatformsController = PlatformsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取支持的平台列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "getSupportedPlatforms", null);
__decorate([
    (0, common_1.Get)(':platform/info'),
    (0, swagger_1.ApiOperation)({ summary: '获取平台详细信息' }),
    __param(0, (0, common_1.Param)('platform')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "getPlatformInfo", null);
__decorate([
    (0, common_1.Post)('authorize'),
    (0, swagger_1.ApiOperation)({ summary: '获取平台OAuth授权URL' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [platform_dto_1.AuthorizePlatformDto, String]),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "getAuthorizeUrl", null);
__decorate([
    (0, common_1.Delete)(':accountId/revoke'),
    (0, swagger_1.ApiOperation)({ summary: '解除平台授权' }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('accountId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "revokeAuthorization", null);
__decorate([
    (0, common_1.Get)('accounts'),
    (0, swagger_1.ApiOperation)({ summary: '获取已授权平台账号列表' }),
    (0, swagger_1.ApiQuery)({ name: 'platform', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'teamId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'skip', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'take', required: false }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [platform_dto_1.PlatformFilterDto, String]),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "getAuthorizedAccounts", null);
__decorate([
    (0, common_1.Post)('collect'),
    (0, swagger_1.ApiOperation)({ summary: '采集单个账号数据' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [platform_dto_1.CollectDataDto]),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "collectAccountData", null);
__decorate([
    (0, common_1.Post)('collect/batch'),
    (0, swagger_1.ApiOperation)({ summary: '批量采集数据' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [platform_dto_1.BatchCollectDto]),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "batchCollectData", null);
__decorate([
    (0, common_1.Post)(':accountId/refresh-token'),
    (0, swagger_1.ApiOperation)({ summary: '刷新平台Token' }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)('accountId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "refreshToken", null);
__decorate([
    (0, common_1.Post)('refresh-expiring-tokens'),
    (0, swagger_1.ApiOperation)({ summary: '批量刷新即将过期的Token' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PlatformsController.prototype, "refreshExpiringTokens", null);
exports.PlatformsController = PlatformsController = __decorate([
    (0, swagger_1.ApiTags)('platforms'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('platforms'),
    __metadata("design:paramtypes", [platforms_service_1.PlatformsService,
        oauth_service_1.OAuthService])
], PlatformsController);
//# sourceMappingURL=platforms.controller.js.map