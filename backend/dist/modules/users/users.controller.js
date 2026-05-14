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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const users_service_1 = require("./users.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
const prisma_enums_1 = require("../../common/prisma-enums");
const prisma_service_1 = require("../../prisma/prisma.service");
class UpdateUserDto {
}
__decorate([
    (0, swagger_2.ApiPropertyOptional)({ description: '用户名' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "name", void 0);
__decorate([
    (0, swagger_2.ApiPropertyOptional)({ description: '手机号' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_2.ApiPropertyOptional)({ description: '头像URL' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateUserDto.prototype, "avatar", void 0);
let UsersController = class UsersController {
    constructor(usersService, prisma) {
        this.usersService = usersService;
        this.prisma = prisma;
    }
    async findAll(page, limit, search) {
        const pageNum = Math.max(1, page || 1);
        const limitNum = Math.min(100, Math.max(1, limit || 20));
        const skip = (pageNum - 1) * limitNum;
        const where = search
            ? {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                ],
            }
            : {};
        return this.usersService.findAll({ skip, take: limitNum, where });
    }
    async getProfile(userId) {
        return this.usersService.findById(userId);
    }
    async findOne(id, currentUserId, currentRole) {
        if (id !== currentUserId && !['OWNER', 'ADMIN'].includes(currentRole)) {
            throw new common_1.ForbiddenException('无权查看其他用户信息');
        }
        return this.usersService.findById(id);
    }
    async updateProfile(userId, dto) {
        return this.usersService.update(userId, dto);
    }
    async remove(id) {
        return this.usersService.remove(id);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)(),
    (0, roles_decorator_1.Roles)(prisma_enums_1.Role.OWNER, prisma_enums_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: '获取用户列表（管理员）' }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, description: '页码（从1开始）' }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, description: '每页条数（最大100）' }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, description: '搜索关键词' }),
    __param(0, (0, common_1.Query)('page')),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({ summary: '获取当前用户信息' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '获取指定用户详情' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权查看他人信息' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '用户不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('role')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)('me'),
    (0, swagger_1.ApiOperation)({ summary: '更新当前用户信息' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateUserDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, roles_decorator_1.Roles)(prisma_enums_1.Role.OWNER, prisma_enums_1.Role.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: '删除用户（软删除，管理员）' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '用户不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "remove", null);
exports.UsersController = UsersController = __decorate([
    (0, swagger_1.ApiTags)('users'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        prisma_service_1.PrismaService])
], UsersController);
//# sourceMappingURL=users.controller.js.map