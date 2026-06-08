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
var NotificationsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let NotificationsService = NotificationsService_1 = class NotificationsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(NotificationsService_1.name);
    }
    async create(params) {
        const notification = await this.prisma.notification.create({
            data: {
                userId: params.userId,
                type: params.type,
                title: params.title,
                content: params.content || null,
                metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
            },
        });
        this.logger.log(`通知已创建: [${params.type}] ${params.title} -> ${params.userId}`);
        return notification;
    }
    async findAll(userId, params) {
        const { skip = 0, take = 20, unreadOnly = false } = params;
        const where = { userId };
        if (unreadOnly)
            where.read = false;
        const [notifications, total, unreadCount] = await Promise.all([
            this.prisma.notification.findMany({
                where,
                skip,
                take,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.notification.count({ where }),
            this.prisma.notification.count({ where: { userId, read: false } }),
        ]);
        return { notifications, total, unreadCount, skip, take };
    }
    async getUnreadCount(userId) {
        const count = await this.prisma.notification.count({
            where: { userId, read: false },
        });
        return { unreadCount: count };
    }
    async markAsRead(id, userId) {
        await this.prisma.notification.updateMany({
            where: { id },
            data: { read: true },
        });
        return { success: true };
    }
    async markAllAsRead(userId) {
        const result = await this.prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true },
        });
        return { success: true, count: result.count };
    }
    async remove(id, userId) {
        await this.prisma.notification.deleteMany({
            where: { id },
        });
        return { success: true };
    }
    async clearRead(userId) {
        const result = await this.prisma.notification.deleteMany({
            where: { userId, read: true },
        });
        return { success: true, count: result.count };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = NotificationsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map