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
exports.AIController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const ai_service_1 = require("./ai.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const ai_request_dto_1 = require("./dto/ai-request.dto");
let AIController = class AIController {
    constructor(aiService) {
        this.aiService = aiService;
    }
    async generateContent(dto) {
        return this.aiService.generateContent(dto);
    }
    async generateBatch(items) {
        return this.aiService.generateBatchContent(items);
    }
    async generateTitles(body) {
        return this.aiService.generateTitles(body.topic, body.platform, body.count);
    }
    async generateTags(body) {
        return this.aiService.generateTags(body.topic, body.platform);
    }
    async getBestPublishTime(dto) {
        return this.aiService.getBestPublishTime(dto);
    }
    async getPublishFrequency(dto) {
        return this.aiService.getPublishFrequency(dto);
    }
    async predictTrend(dto) {
        return this.aiService.predictTrend(dto);
    }
    async detectAnomaly(dto) {
        return this.aiService.detectAnomaly(dto);
    }
    async detectAccountRisk(body) {
        return this.aiService.detectAccountRisk(body);
    }
    async reviewContent(dto) {
        return this.aiService.reviewContent(dto);
    }
    async getProviders() {
        return this.aiService.getProviders();
    }
    async getCapabilities() {
        return this.aiService.getCapabilities();
    }
};
exports.AIController = AIController;
__decorate([
    (0, common_1.Post)('content/generate'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 10 } }),
    (0, swagger_1.ApiOperation)({ summary: '智能内容生成（脚本/标题/标签/文案）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_request_dto_1.GenerateContentDto]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "generateContent", null);
__decorate([
    (0, common_1.Post)('content/batch'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 3 } }),
    (0, swagger_1.ApiOperation)({ summary: '批量内容生成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Array]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "generateBatch", null);
__decorate([
    (0, common_1.Post)('content/titles'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 20 } }),
    (0, swagger_1.ApiOperation)({ summary: '快速标题生成' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "generateTitles", null);
__decorate([
    (0, common_1.Post)('content/tags'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 20 } }),
    (0, swagger_1.ApiOperation)({ summary: '快速标签推荐' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "generateTags", null);
__decorate([
    (0, common_1.Post)('publish/best-time'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 10 } }),
    (0, swagger_1.ApiOperation)({ summary: '最佳发布时间推荐' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_request_dto_1.OptimizePublishDto]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "getBestPublishTime", null);
__decorate([
    (0, common_1.Post)('publish/frequency'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 10 } }),
    (0, swagger_1.ApiOperation)({ summary: '发布频率优化建议' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_request_dto_1.OptimizePublishDto]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "getPublishFrequency", null);
__decorate([
    (0, common_1.Post)('trend/predict'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 10 } }),
    (0, swagger_1.ApiOperation)({ summary: '趋势预测（粉丝/播放/互动）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_request_dto_1.PredictTrendDto]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "predictTrend", null);
__decorate([
    (0, common_1.Post)('anomaly/detect'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 10 } }),
    (0, swagger_1.ApiOperation)({ summary: '数据异常检测' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_request_dto_1.DetectAnomalyDto]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "detectAnomaly", null);
__decorate([
    (0, common_1.Post)('anomaly/account-risk'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 10 } }),
    (0, swagger_1.ApiOperation)({ summary: '账号风险检测' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "detectAccountRisk", null);
__decorate([
    (0, common_1.Post)('review'),
    (0, throttler_1.Throttle)({ short: { ttl: 60000, limit: 10 } }),
    (0, swagger_1.ApiOperation)({ summary: '内容审核（违规检测/敏感词过滤）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_request_dto_1.ReviewContentDto]),
    __metadata("design:returntype", Promise)
], AIController.prototype, "reviewContent", null);
__decorate([
    (0, common_1.Get)('providers'),
    (0, swagger_1.ApiOperation)({ summary: '获取可用AI提供商列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AIController.prototype, "getProviders", null);
__decorate([
    (0, common_1.Get)('capabilities'),
    (0, swagger_1.ApiOperation)({ summary: '获取AI能力清单' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AIController.prototype, "getCapabilities", null);
exports.AIController = AIController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AIService])
], AIController);
//# sourceMappingURL=ai.controller.js.map