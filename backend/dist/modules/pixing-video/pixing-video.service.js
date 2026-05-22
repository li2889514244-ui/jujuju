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
var PixingVideoService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PixingVideoService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let PixingVideoService = PixingVideoService_1 = class PixingVideoService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PixingVideoService_1.name);
    }
    async createTask(userId, dto) {
        return this.prisma.pixingVideoTask.create({
            data: {
                userId,
                teacher: dto.teacher,
                text: dto.text,
                status: 'pending',
            },
        });
    }
    async listTasks(userId, status) {
        const where = { userId };
        if (status)
            where.status = status;
        return this.prisma.pixingVideoTask.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
    }
    async getTask(id, userId) {
        const task = await this.prisma.pixingVideoTask.findFirst({
            where: { id, userId },
        });
        if (!task)
            throw new common_1.NotFoundException('任务不存在');
        return task;
    }
    async getNextPendingTask() {
        return this.prisma.pixingVideoTask.findFirst({
            where: { status: 'pending' },
            orderBy: { createdAt: 'asc' },
        });
    }
    async updateTask(id, dto) {
        const task = await this.prisma.pixingVideoTask.findUnique({ where: { id } });
        if (!task)
            throw new common_1.NotFoundException('任务不存在');
        return this.prisma.pixingVideoTask.update({
            where: { id },
            data: {
                ...(dto.status && { status: dto.status }),
                ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl }),
                ...(dto.srtContent !== undefined && { srtContent: dto.srtContent }),
                ...(dto.error !== undefined && { error: dto.error }),
            },
        });
    }
};
exports.PixingVideoService = PixingVideoService;
exports.PixingVideoService = PixingVideoService = PixingVideoService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PixingVideoService);
//# sourceMappingURL=pixing-video.service.js.map