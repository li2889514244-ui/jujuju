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
var TeamsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TeamsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let TeamsService = TeamsService_1 = class TeamsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TeamsService_1.name);
    }
    async create(dto, userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { organizationId: true },
        });
        const organizationId = dto.organizationId || user?.organizationId;
        if (!organizationId) {
            throw new common_1.ForbiddenException('用户未加入任何组织，无法创建团队');
        }
        const team = await this.prisma.team.create({
            data: {
                name: dto.name,
                organizationId,
            },
            include: {
                organization: {
                    select: { id: true, name: true },
                },
            },
        });
        this.logger.log(`团队创建成功: ${team.name} (${team.id})`);
        return team;
    }
    async findAll(organizationId) {
        const where = organizationId ? { organizationId } : {};
        return this.prisma.team.findMany({
            where,
            include: {
                organization: {
                    select: { id: true, name: true },
                },
                accounts: {
                    select: {
                        id: true,
                        platform: true,
                        nickname: true,
                        status: true,
                    },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findById(id) {
        const team = await this.prisma.team.findUnique({
            where: { id },
            include: {
                organization: {
                    select: { id: true, name: true, plan: true },
                },
                accounts: {
                    select: {
                        id: true,
                        platform: true,
                        nickname: true,
                        avatar: true,
                        followers: true,
                        status: true,
                        owner: {
                            select: { id: true, name: true, email: true },
                        },
                    },
                },
            },
        });
        if (!team) {
            throw new common_1.NotFoundException('团队不存在');
        }
        return team;
    }
    async inviteMember(dto, inviterId) {
        const invitee = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (!invitee) {
            throw new common_1.NotFoundException('该邮箱未注册，请先注册账号');
        }
        const inviter = await this.prisma.user.findUnique({
            where: { id: inviterId },
            select: { organizationId: true, role: true },
        });
        if (!inviter?.organizationId) {
            throw new common_1.ForbiddenException('您未加入任何组织');
        }
        if (!['OWNER', 'ADMIN', 'MANAGER'].includes(inviter.role)) {
            throw new common_1.ForbiddenException('您没有邀请成员的权限');
        }
        if (invitee.organizationId === inviter.organizationId) {
            throw new common_1.ConflictException('该用户已在您的组织中');
        }
        const updatedUser = await this.prisma.user.update({
            where: { id: invitee.id },
            data: {
                organizationId: inviter.organizationId,
                role: dto.role,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                organization: {
                    select: { id: true, name: true },
                },
            },
        });
        this.logger.log(`成员邀请成功: ${dto.email} 加入组织 ${inviter.organizationId}，角色: ${dto.role}`);
        return updatedUser;
    }
    async updateMemberRole(organizationId, memberId, newRole, operatorId) {
        const operator = await this.prisma.user.findUnique({
            where: { id: operatorId },
        });
        if (!operator || !['OWNER', 'ADMIN'].includes(operator.role)) {
            throw new common_1.ForbiddenException('您没有修改成员角色的权限');
        }
        if (memberId === operatorId) {
            throw new common_1.ForbiddenException('不能修改自己的角色');
        }
        const member = await this.prisma.user.findFirst({
            where: { id: memberId, organizationId },
        });
        if (!member) {
            throw new common_1.NotFoundException('成员不存在');
        }
        const roleHierarchy = {
            OWNER: 5,
            ADMIN: 4,
            MANAGER: 3,
            MEMBER: 2,
            VIEWER: 1,
        };
        const operatorLevel = roleHierarchy[operator.role] || 0;
        const targetLevel = roleHierarchy[newRole] || 0;
        if (targetLevel >= operatorLevel) {
            throw new common_1.ForbiddenException('不能设置与自己相同或更高的角色');
        }
        return this.prisma.user.update({
            where: { id: memberId },
            data: { role: newRole },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
            },
        });
    }
    async removeMember(organizationId, memberId, operatorId) {
        const operator = await this.prisma.user.findUnique({
            where: { id: operatorId },
        });
        if (!operator || !['OWNER', 'ADMIN'].includes(operator.role)) {
            throw new common_1.ForbiddenException('您没有移除成员的权限');
        }
        if (memberId === operatorId) {
            throw new common_1.ForbiddenException('不能移除自己');
        }
        const member = await this.prisma.user.findFirst({
            where: { id: memberId, organizationId },
        });
        if (!member) {
            throw new common_1.NotFoundException('成员不存在');
        }
        if (member.role === 'OWNER') {
            throw new common_1.ForbiddenException('不能移除组织所有者');
        }
        return this.prisma.user.update({
            where: { id: memberId },
            data: {
                organizationId: null,
                role: 'MEMBER',
            },
        });
    }
    async getMembers(organizationId) {
        return this.prisma.user.findMany({
            where: { organizationId },
            select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
                role: true,
                status: true,
                lastLoginAt: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        });
    }
};
exports.TeamsService = TeamsService;
exports.TeamsService = TeamsService = TeamsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TeamsService);
//# sourceMappingURL=teams.service.js.map