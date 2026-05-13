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
var UsersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const ALLOWED_SELF_UPDATE_FIELDS = new Set(['name', 'phone', 'avatar']);
let UsersService = UsersService_1 = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(UsersService_1.name);
    }
    async findAll(params) {
        const { skip = 0, take = 20, where, orderBy } = params;
        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                skip,
                take,
                where,
                orderBy: orderBy || { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    phone: true,
                    avatar: true,
                    role: true,
                    status: true,
                    lastLoginAt: true,
                    createdAt: true,
                    updatedAt: true,
                    organization: {
                        select: { id: true, name: true, plan: true },
                    },
                },
            }),
            this.prisma.user.count({ where }),
        ]);
        return { users, total, skip, take };
    }
    async findById(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                avatar: true,
                role: true,
                status: true,
                lastLoginAt: true,
                createdAt: true,
                updatedAt: true,
                organization: {
                    select: { id: true, name: true, plan: true, status: true },
                },
                accounts: {
                    select: {
                        id: true,
                        platform: true,
                        nickname: true,
                        avatar: true,
                        followers: true,
                        status: true,
                    },
                },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('用户不存在');
        }
        return user;
    }
    async update(id, data) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException('用户不存在');
        }
        const safeData = {};
        for (const key of Object.keys(data)) {
            if (ALLOWED_SELF_UPDATE_FIELDS.has(key)) {
                safeData[key] = data[key];
            }
        }
        if (Object.keys(safeData).length === 0) {
            throw new common_1.ForbiddenException('没有可更新的合法字段');
        }
        return this.prisma.user.update({
            where: { id },
            data: safeData,
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                avatar: true,
                role: true,
                status: true,
                updatedAt: true,
            },
        });
    }
    async remove(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException('用户不存在');
        }
        return this.prisma.user.update({
            where: { id },
            data: { status: 'INACTIVE' },
        });
    }
    async findByOrganization(organizationId) {
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
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = UsersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map