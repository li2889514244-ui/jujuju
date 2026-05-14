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
exports.TeamsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const teams_service_1 = require("./teams.service");
const create_team_dto_1 = require("./dto/create-team.dto");
const invite_member_dto_1 = require("./dto/invite-member.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const prisma_enums_1 = require("../../common/prisma-enums");
let TeamsController = class TeamsController {
    constructor(teamsService) {
        this.teamsService = teamsService;
    }
    async create(dto, userId) {
        return this.teamsService.create(dto, userId);
    }
    async findAll(organizationId) {
        return this.teamsService.findAll(organizationId);
    }
    async getMembers(orgId) {
        return this.teamsService.getMembers(orgId);
    }
    async inviteMember(dto, userId) {
        return this.teamsService.inviteMember(dto, userId);
    }
    async updateMemberRole(memberId, role, userId, orgId) {
        return this.teamsService.updateMemberRole(orgId, memberId, role, userId);
    }
    async removeMember(memberId, userId, orgId) {
        return this.teamsService.removeMember(orgId, memberId, userId);
    }
    async findOne(id) {
        return this.teamsService.findById(id);
    }
};
exports.TeamsController = TeamsController;
__decorate([
    (0, common_1.Post)(),
    (0, roles_decorator_1.Roles)(prisma_enums_1.Role.OWNER, prisma_enums_1.Role.ADMIN, prisma_enums_1.Role.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: '创建团队' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '创建成功' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_team_dto_1.CreateTeamDto, String]),
    __metadata("design:returntype", Promise)
], TeamsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: '获取团队列表' }),
    __param(0, (0, common_1.Query)('organizationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TeamsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('members'),
    (0, swagger_1.ApiOperation)({ summary: '获取当前组织成员列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('organizationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TeamsController.prototype, "getMembers", null);
__decorate([
    (0, common_1.Post)('members/invite'),
    (0, roles_decorator_1.Roles)(prisma_enums_1.Role.OWNER, prisma_enums_1.Role.ADMIN, prisma_enums_1.Role.MANAGER),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    (0, swagger_1.ApiOperation)({ summary: '邀请成员' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '邀请成功' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '邮箱未注册' }),
    (0, swagger_1.ApiResponse)({ status: 409, description: '用户已在组织中' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [invite_member_dto_1.InviteMemberDto, String]),
    __metadata("design:returntype", Promise)
], TeamsController.prototype, "inviteMember", null);
__decorate([
    (0, common_1.Put)('members/:memberId/role'),
    (0, roles_decorator_1.Roles)(prisma_enums_1.Role.OWNER, prisma_enums_1.Role.ADMIN),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '更新成员角色' }),
    __param(0, (0, common_1.Param)('memberId')),
    __param(1, (0, common_1.Body)('role')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(3, (0, current_user_decorator_1.CurrentUser)('organizationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], TeamsController.prototype, "updateMemberRole", null);
__decorate([
    (0, common_1.Delete)('members/:memberId'),
    (0, roles_decorator_1.Roles)(prisma_enums_1.Role.OWNER, prisma_enums_1.Role.ADMIN),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '移除成员' }),
    (0, swagger_1.ApiResponse)({ status: 403, description: '无权限操作' }),
    __param(0, (0, common_1.Param)('memberId')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(2, (0, current_user_decorator_1.CurrentUser)('organizationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], TeamsController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: '获取团队详情' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '团队不存在' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TeamsController.prototype, "findOne", null);
exports.TeamsController = TeamsController = __decorate([
    (0, swagger_1.ApiTags)('teams'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('teams'),
    __metadata("design:paramtypes", [teams_service_1.TeamsService])
], TeamsController);
//# sourceMappingURL=teams.controller.js.map