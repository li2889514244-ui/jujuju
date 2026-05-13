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
var OAuthCallbackHandler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthCallbackHandler = void 0;
const common_1 = require("@nestjs/common");
const oauth_service_1 = require("./oauth.service");
let OAuthCallbackHandler = OAuthCallbackHandler_1 = class OAuthCallbackHandler {
    constructor(oauthService) {
        this.oauthService = oauthService;
        this.logger = new common_1.Logger(OAuthCallbackHandler_1.name);
    }
    async handle(payload) {
        const { code, state, platform, error, errorDescription } = payload;
        if (error) {
            this.logger.warn(`用户拒绝授权: ${platform}, error=${error}`);
            return {
                success: false,
                platform,
                message: errorDescription || '用户拒绝了授权请求',
                errorCode: error,
            };
        }
        if (!code) {
            return {
                success: false,
                platform,
                message: '缺少授权码',
                errorCode: 'MISSING_CODE',
            };
        }
        try {
            const result = await this.oauthService.handleCallback(code, state);
            return {
                success: result.success,
                platform: result.platform || platform,
                accountId: result.accountId,
                message: result.message,
            };
        }
        catch (err) {
            this.logger.error(`回调处理异常: ${platform}`, err);
            return {
                success: false,
                platform,
                message: err.message || '回调处理异常',
                errorCode: 'CALLBACK_ERROR',
            };
        }
    }
    async handleBatch(payloads) {
        const results = [];
        for (const payload of payloads) {
            const result = await this.handle(payload);
            results.push(result);
        }
        return results;
    }
};
exports.OAuthCallbackHandler = OAuthCallbackHandler;
exports.OAuthCallbackHandler = OAuthCallbackHandler = OAuthCallbackHandler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [oauth_service_1.OAuthService])
], OAuthCallbackHandler);
//# sourceMappingURL=oauth-callback.handler.js.map