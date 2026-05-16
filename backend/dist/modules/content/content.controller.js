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
exports.ContentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const content_service_1 = require("./content.service");
const create_content_dto_1 = require("./dto/create-content.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const client_1 = require("@prisma/client"); const prisma_enums_1 = require("../../common/prisma-enums");
let ContentController = class ContentController {
    constructor(contentService) {
        this.contentService = contentService;
    }
    async create(dto, userId) {
        return this.contentService.create(dto, userId);
    }
    async findAll(accountId, status, page, limit, userId, search) {
        const pageNum = Math.max(1, page || 1);
        const limitNum = Math.min(100, Math.max(1, limit || 20));
        const skip = (pageNum - 1) * limitNum;
        return this.contentService.findAll({ userId, accountId, status, search, skip, take: limitNum });
    }
    async getScheduled() {
        return this.contentService.getScheduledPosts();
    }
    async findOne(id) {
        return this.contentService.findById(id);
    }
    async update(id, dto, userId) {
        return this.contentService.update(id, dto, userId);
    }
    async publish(id, userId) {
        return this.contentService.publish(id, userId);
    }
    async batchPublish(userId, dto) {
        return this.contentService.batchPublish(dto, userId);
    }
    async remove(id, userId) {
        return this.contentService.remove(id, userId);
    }
    async reportPublishResult(id, userId, body) {
        return this.contentService.reportPublishResult(id, userId, body);
    }
};
exports.ContentController = ContentController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '创建内容' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '创建成功' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_content_dto_1.CreateContentDto, String]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取内容列表' }),
    (0, swagger_1.ApiQuery)({ name: 'accountId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: prisma_enums_1.PostStatus }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, description: '页码（从1开始）' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: '每页条数（最大100）' }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, description: 'search keyword' }),
    __param(0, (0, common_1.Query)('accountId')),
    __param(1, (0, common_1.Query)('status')),
    __param(2, (0, common_1.Query)('page')),
    __param(3, (0, common_1.Query)('limit')),
    __param(4, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(5, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('scheduled'),
    (0, swagger_1.ApiOperation)({ summary: '获取待发布队列' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "getScheduled", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '获取内容详情' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '内容不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '更新内容' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '非草稿/定时状态不可修改' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/publish'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '发布内容' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '当前状态不允许发布' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "publish", null);
__decorate([
    (0, common_1.Post)('batch-publish'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '一键分发：同一内容发布到多个账号' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "batchPublish", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '删除内容' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '发布中的内容无法删除' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "remove", null);

__decorate([
    (0, common_1.Post)(':id/publish-result'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '\u4e0a\u62a5\u53d1\u5e03\u7ed3\u679c\uff08\u684c\u9762\u4f34\u4fa3\u56de\u8c03\uff09' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "reportPublishResult", null);
exports.ContentController = ContentController = __decorate([
    (0, swagger_1.ApiTags)('content'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('content'),
    __metadata("design:paramtypes", [content_service_1.ContentService])
], ContentController);
//# sourceMappingURL=content.controller.js.map