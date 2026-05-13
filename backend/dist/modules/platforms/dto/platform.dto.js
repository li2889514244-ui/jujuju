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
exports.PlatformFilterDto = exports.BatchCollectDto = exports.CollectDataDto = exports.AuthorizePlatformDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
class AuthorizePlatformDto {
}
exports.AuthorizePlatformDto = AuthorizePlatformDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '平台标识', enum: ['DOUYIN', 'KUAISHOU', 'XIAOHONGSHU', 'WECHAT_VIDEO', 'BILIBILI', 'WEIBO'] }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AuthorizePlatformDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '团队ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AuthorizePlatformDto.prototype, "teamId", void 0);
class CollectDataDto {
}
exports.CollectDataDto = CollectDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '账号ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CollectDataDto.prototype, "accountId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '数据类型', enum: ['account', 'content', 'daily'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['account', 'content', 'daily']),
    __metadata("design:type", String)
], CollectDataDto.prototype, "type", void 0);
class BatchCollectDto {
}
exports.BatchCollectDto = BatchCollectDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: '账号ID列表', type: [String] }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.IsString)({ each: true }),
    __metadata("design:type", Array)
], BatchCollectDto.prototype, "accountIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '数据类型', enum: ['account', 'content', 'daily'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['account', 'content', 'daily']),
    __metadata("design:type", String)
], BatchCollectDto.prototype, "type", void 0);
class PlatformFilterDto {
}
exports.PlatformFilterDto = PlatformFilterDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '平台筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlatformFilterDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '团队ID' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlatformFilterDto.prototype, "teamId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '状态筛选' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PlatformFilterDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '跳过条数', default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PlatformFilterDto.prototype, "skip", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: '每页条数', default: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PlatformFilterDto.prototype, "take", void 0);
//# sourceMappingURL=platform.dto.js.map