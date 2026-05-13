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
var OAuthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const oauth_service_1 = require("./oauth.service");
let OAuthController = OAuthController_1 = class OAuthController {
    constructor(oauthService) {
        this.oauthService = oauthService;
        this.logger = new common_1.Logger(OAuthController_1.name);
    }
    getAuthorizeUrl(platform, userId, teamId) {
        const url = this.oauthService.buildAuthorizeUrl(platform, userId, teamId);
        return { url };
    }
    async handleCallback(code, state, platform, res) {
        try {
            const result = await this.oauthService.handleCallback(code, state);
            if (result.success) {
                const redirectUrl = `/platforms?status=success&platform=${result.platform}&accountId=${result.accountId}`;
                return res.redirect(redirectUrl);
            }
            else {
                const redirectUrl = `/platforms?status=error&platform=${result.platform}&message=${encodeURIComponent(result.message)}`;
                return res.redirect(redirectUrl);
            }
        }
        catch (error) {
            this.logger.error('OAuth回调处理失败', error);
            const redirectUrl = `/platforms?status=error&message=${encodeURIComponent(error.message)}`;
            return res.redirect(redirectUrl);
        }
    }
};
exports.OAuthController = OAuthController;
__decorate([
    (0, common_1.Get)('authorize/:platform'),
    (0, swagger_1.ApiOperation)({ summary: '获取平台OAuth授权URL' }),
    (0, swagger_1.ApiQuery)({ name: 'userId', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'teamId', required: false }),
    __param(0, (0, common_1.Query)('platform')),
    __param(1, (0, common_1.Query)('userId')),
    __param(2, (0, common_1.Query)('teamId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], OAuthController.prototype, "getAuthorizeUrl", null);
__decorate([
    (0, common_1.Get)('callback/:platform'),
    (0, swagger_1.ApiOperation)({ summary: 'OAuth回调处理' }),
    (0, swagger_1.ApiQuery)({ name: 'code', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'state', required: true }),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Query)('platform')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], OAuthController.prototype, "handleCallback", null);
exports.OAuthController = OAuthController = OAuthController_1 = __decorate([
    (0, swagger_1.ApiTags)('platforms-oauth'),
    (0, common_1.Controller)('platforms/oauth'),
    __metadata("design:paramtypes", [oauth_service_1.OAuthService])
], OAuthController);
//# sourceMappingURL=oauth.controller.js.map