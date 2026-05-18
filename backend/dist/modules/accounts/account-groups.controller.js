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
exports.AccountGroupsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const prisma_service_1 = require("../../prisma/prisma.service");
const class_validator_1 = require("class-validator");
class CreateGroupDto {
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateGroupDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateGroupDto.prototype, "color", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], CreateGroupDto.prototype, "sortOrder", void 0);
class UpdateGroupDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateGroupDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateGroupDto.prototype, "color", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], UpdateGroupDto.prototype, "sortOrder", void 0);
let AccountGroupsController = class AccountGroupsController {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, userId) {
        return this.prisma.accountGroup.create({
            data: {
                name: dto.name,
                color: dto.color || '#409EFF',
                sortOrder: dto.sortOrder || 0,
                userId,
            },
        });
    }
    async findAll(userId) {
        return this.prisma.accountGroup.findMany({
            where: {},
            include: { _count: { select: { accounts: true } } },
            orderBy: { sortOrder: 'asc' },
        });
    }
    async update(id, dto, userId) {
        const group = await this.prisma.accountGroup.findFirst({ where: { id } });
        if (!group) {
            return { success: false, message: '分组不存在或无权操作' };
        }
        return this.prisma.accountGroup.update({
            where: { id },
            data: dto,
            include: { _count: { select: { accounts: true } } },
        });
    }
    async remove(id, userId) {
        await this.prisma.account.updateMany({
            where: { groupId: id },
            data: { groupId: null },
        });
        return this.prisma.accountGroup.deleteMany({ where: { id } });
    }
    async setAccounts(groupId, body, userId) {
        await this.prisma.account.updateMany({
            where: { id: { in: body.accountIds } },
            data: { groupId },
        });
        return { success: true, count: body.accountIds.length };
    }
};
exports.AccountGroupsController = AccountGroupsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: '创建账号分组' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateGroupDto, String]),
    __metadata("design:returntype", Promise)
], AccountGroupsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取所有分组（含账号数量）' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AccountGroupsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '更新分组' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateGroupDto, String]),
    __metadata("design:returntype", Promise)
], AccountGroupsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '删除分组（不删除账号）' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AccountGroupsController.prototype, "remove", null);
__decorate([
    (0, common_1.Put)(':id/accounts'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '批量设置账号分组' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], AccountGroupsController.prototype, "setAccounts", null);
exports.AccountGroupsController = AccountGroupsController = __decorate([
    (0, swagger_1.ApiTags)('account-groups'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('account-groups'),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AccountGroupsController);
//# sourceMappingURL=account-groups.controller.js.map