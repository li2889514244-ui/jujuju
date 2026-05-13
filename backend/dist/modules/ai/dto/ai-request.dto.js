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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewContentDto = exports.DetectAnomalyDto = exports.PredictTrendDto = exports.OptimizePublishDto = exports.GenerateContentDto = exports.ContentType = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
var ContentType;
(function (ContentType) {
    ContentType["VIDEO_SCRIPT"] = "video_script";
    ContentType["TITLE"] = "title";
    ContentType["TAGS"] = "tags";
    ContentType["CAPTION"] = "caption";
})(ContentType || (exports.ContentType = ContentType = {}));
class GenerateContentDto {
}
exports.GenerateContentDto = GenerateContentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ContentType, description: '内容类型' }),
    (0, class_validator_1.IsEnum)(ContentType),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: '主题/关键词' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "topic", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '平台' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目标受众' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "audience", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '风格/语气' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "style", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '参考内容' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateContentDto.prototype, "reference", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '生成数量', default: 1 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(10),
    __metadata("design:type", Number)
], GenerateContentDto.prototype, "count", void 0);
class OptimizePublishDto {
}
exports.OptimizePublishDto = OptimizePublishDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '平台' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizePublishDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '内容类型' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizePublishDto.prototype, "contentType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '目标受众' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizePublishDto.prototype, "audience", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '历史数据（JSON字符串）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], OptimizePublishDto.prototype, "historicalData", void 0);
class PredictTrendDto {
}
exports.PredictTrendDto = PredictTrendDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['followers', 'likes', 'views', 'engagement'] }),
    (0, class_validator_1.IsEnum)(['followers', 'likes', 'views', 'engagement']),
    __metadata("design:type", String)
], PredictTrendDto.prototype, "metric", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '平台' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PredictTrendDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '预测天数', default: 30 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(365),
    __metadata("design:type", Number)
], PredictTrendDto.prototype, "days", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '历史数据（JSON字符串）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PredictTrendDto.prototype, "historicalData", void 0);
class DetectAnomalyDto {
}
exports.DetectAnomalyDto = DetectAnomalyDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '数据集（JSON字符串）' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DetectAnomalyDto.prototype, "dataset", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '指标类型' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DetectAnomalyDto.prototype, "metric", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '平台' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], DetectAnomalyDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '敏感度: low|medium|high', default: 'medium' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['low', 'medium', 'high']),
    __metadata("design:type", String)
], DetectAnomalyDto.prototype, "sensitivity", void 0);
class ReviewContentDto {
}
exports.ReviewContentDto = ReviewContentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '待审核内容' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReviewContentDto.prototype, "content", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '内容类型: text|title|caption' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReviewContentDto.prototype, "contentType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '平台' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReviewContentDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '严格程度: lenient|normal|strict', default: 'normal' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['lenient', 'normal', 'strict']),
    __metadata("design:type", String)
], ReviewContentDto.prototype, "strictness", void 0);
//# sourceMappingURL=ai-request.dto.js.map