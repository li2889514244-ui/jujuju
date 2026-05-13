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
exports.ContentReviewController = void 0;
const common_1 = require("@nestjs/common");
const content_review_service_1 = require("./content-review.service");
const class_validator_1 = require("class-validator");
class ReviewDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50000),
    __metadata("design:type", String)
], ReviewDto.prototype, "content", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ReviewDto.prototype, "title", void 0);
class QuickCheckDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50000),
    __metadata("design:type", String)
], QuickCheckDto.prototype, "text", void 0);
let ContentReviewController = class ContentReviewController {
    constructor(reviewService) {
        this.reviewService = reviewService;
    }
    async review(dto) {
        return this.reviewService.review(dto.content, dto.title);
    }
    async quickCheck(dto) {
        return this.reviewService.quickCheck(dto.text);
    }
};
exports.ContentReviewController = ContentReviewController;
__decorate([
    (0, common_1.Post)('review'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ReviewDto]),
    __metadata("design:returntype", Promise)
], ContentReviewController.prototype, "review", null);
__decorate([
    (0, common_1.Post)('quick-check'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [QuickCheckDto]),
    __metadata("design:returntype", Promise)
], ContentReviewController.prototype, "quickCheck", null);
exports.ContentReviewController = ContentReviewController = __decorate([
    (0, common_1.Controller)('content-review'),
    __metadata("design:paramtypes", [content_review_service_1.ContentReviewService])
], ContentReviewController);
//# sourceMappingURL=content-review.controller.js.map