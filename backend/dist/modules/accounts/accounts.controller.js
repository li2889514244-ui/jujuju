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
exports.AccountsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const accounts_service_1 = require("./accounts.service");
const create_account_dto_1 = require("./dto/create-account.dto");
const update_account_dto_1 = require("./dto/update-account.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const client_1 = require("@prisma/client"); const prisma_enums_1 = require("../../common/prisma-enums");
let AccountsController = class AccountsController {
    constructor(accountsService) {
        this.accountsService = accountsService;
    }
    async create(dto, userId) {
        return this.accountsService.create(dto, userId);
    }
    async findAll(platform, teamId, groupId, page, limit, userId, search) {
        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
        const skip = (pageNum - 1) * limitNum;
        return this.accountsService.findAll({ userId, teamId, groupId, platform, search, skip, take: limitNum });
    }
    async findOne(id) {
        return this.accountsService.findById(id);
    }
    async getCookies(id, userId) {
        return this.accountsService.getCookies(id, userId);
    }
    async update(id, dto, userId) {
        return this.accountsService.update(id, dto, userId);
    }
    async remove(id, userId) {
        return this.accountsService.remove(id, userId);
    }
};
exports.AccountsController = AccountsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '创建平台账号' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '创建成功' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: '账号已存在' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_account_dto_1.CreateAccountDto, String]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取账号列表' }),
    (0, swagger_1.ApiQuery)({ name: 'platform', required: false, enum: prisma_enums_1.Platform }),
    (0, swagger_1.ApiQuery)({ name: 'teamId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'groupId', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, description: '页码（从1开始）' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: '每页条数（最大100）' }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, description: 'search keyword' }),
    __param(0, (0, common_1.Query)('platform')),
    __param(1, (0, common_1.Query)('teamId')),
    __param(2, (0, common_1.Query)('groupId')),
    __param(3, (0, common_1.Query)('page')),
    __param(4, (0, common_1.Query)('limit')),
    __param(5, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(6, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '获取账号详情' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '账号不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/cookies'),
    (0, swagger_1.ApiOperation)({ summary: '获取账号Cookie（解密）' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "getCookies", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '更新账号信息' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '账号不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_account_dto_1.UpdateAccountDto, String]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '删除账号' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '账号不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "remove", null);
exports.AccountsController = AccountsController = __decorate([
    (0, swagger_1.ApiTags)('accounts'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('accounts'),
    __metadata("design:paramtypes", [accounts_service_1.AccountsService])
], AccountsController);



AccountsController.prototype.bulkDelete = async function(body, req) {
    const userId = req.user?.id || req.user?.userId;
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
        throw new common_1.BadRequestException('ids must be a non-empty array');
    }
    const result = await this.accountsService.bulkDelete(body.ids, userId);
    return { deleted: result.count };
};

__decorate([
    (0, common_1.Post)('bulk-delete'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "bulkDelete", null);

AccountsController.prototype.bulkMove = async function(body, req) {
    const userId = req.user?.id || req.user?.userId;
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
        throw new common_1.BadRequestException('ids must be a non-empty array');
    }
    if (!body.groupId) {
        throw new common_1.BadRequestException('groupId is required');
    }
    const result = await this.accountsService.bulkMove(body.ids, body.groupId, userId);
    return { moved: result.count };
};

__decorate([
    (0, common_1.Post)('bulk-move'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountsController.prototype, "bulkMove", null);

//# sourceMappingURL=accounts.controller.js.map