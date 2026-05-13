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
var CompetitorsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompetitorsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let CompetitorsService = CompetitorsService_1 = class CompetitorsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(CompetitorsService_1.name);
    }
    async create(data) {
        const existing = await this.prisma.competitor.findUnique({
            where: {
                platform_platformUserId_userId: {
                    platform: data.platform,
                    platformUserId: data.platformUserId,
                    userId: data.userId,
                },
            },
        });
        if (existing) {
            throw new common_1.ConflictException('该竞对账号已存在');
        }
        const competitor = await this.prisma.competitor.create({ data });
        this.logger.log(`竞对添加: ${competitor.nickname} (${competitor.platform})`);
        return competitor;
    }
    async findAll(userId, params) {
        const { platform, skip = 0, take = 50 } = params || {};
        const where = { userId };
        if (platform)
            where.platform = platform;
        const [competitors, total] = await Promise.all([
            this.prisma.competitor.findMany({
                where,
                skip,
                take,
                include: {
                    snapshots: {
                        orderBy: { date: 'desc' },
                        take: 7,
                    },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.competitor.count({ where }),
        ]);
        return { competitors, total, skip, take };
    }
    async findById(id, userId) {
        const competitor = await this.prisma.competitor.findFirst({
            where: { id, userId },
            include: {
                snapshots: {
                    orderBy: { date: 'desc' },
                    take: 30,
                },
            },
        });
        if (!competitor) {
            throw new common_1.NotFoundException('竞对不存在');
        }
        return competitor;
    }
    async remove(id, userId) {
        const competitor = await this.prisma.competitor.findFirst({
            where: { id, userId },
        });
        if (!competitor) {
            throw new common_1.NotFoundException('竞对不存在');
        }
        await this.prisma.competitor.delete({ where: { id } });
        this.logger.log(`竞对删除: ${competitor.nickname}`);
        return { success: true };
    }
    async recordSnapshot(competitorId, data) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const snapshot = await this.prisma.competitorSnapshot.upsert({
            where: {
                competitorId_date: {
                    competitorId,
                    date: today,
                },
            },
            update: data,
            create: {
                competitorId,
                date: today,
                ...data,
            },
        });
        await this.prisma.competitor.update({
            where: { id: competitorId },
            data: { followers: data.followers },
        });
        return snapshot;
    }
    async compare(userId, competitorIds, days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);
        const competitors = await this.prisma.competitor.findMany({
            where: { id: { in: competitorIds }, userId },
            include: {
                snapshots: {
                    where: { date: { gte: startDate } },
                    orderBy: { date: 'asc' },
                },
            },
        });
        return competitors;
    }
};
exports.CompetitorsService = CompetitorsService;
exports.CompetitorsService = CompetitorsService = CompetitorsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CompetitorsService);
//# sourceMappingURL=competitors.service.js.map