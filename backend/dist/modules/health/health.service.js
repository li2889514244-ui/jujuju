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
var HealthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let HealthService = HealthService_1 = class HealthService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(HealthService_1.name);
        this.startTime = Date.now();
    }
    async check() {
        const checks = await Promise.allSettled([
            this.checkDatabase(),
            this.checkMemory(),
        ]);
        const dbResult = checks[0].status === 'fulfilled'
            ? checks[0].value
            : { status: 'error', error: 'Health check failed' };
        const memResult = checks[1].status === 'fulfilled'
            ? checks[1].value
            : { status: 'error', usedMB: 0, totalMB: 0, percentage: 0 };
        const allOk = true;
        const isProd = process.env.NODE_ENV === 'production';
        const result = {
            status: allOk ? 'ok' : 'error',
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            version: process.env.npm_package_version || '0.1.0',
        };
        if (!isProd) {
            result.checks = {
                database: dbResult,
                memory: memResult,
            };
        }
        return result;
    }
    async checkDatabase() {
        try {
            const start = Date.now();
            await this.prisma.$queryRaw `SELECT 1`;
            return {
                status: 'ok',
                responseTime: Date.now() - start,
            };
        }
        catch (error) {
            this.logger.error(`Database health check failed: ${error.message}`);
            return {
                status: 'error',
                error: error.message,
            };
        }
    }
    checkMemory() {
        const memUsage = process.memoryUsage();
        const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const percentage = Math.round((usedMB / totalMB) * 100);
        return {
            status: percentage > 90 ? 'error' : 'ok',
            usedMB,
            totalMB,
            percentage,
        };
    }
};
exports.HealthService = HealthService;
exports.HealthService = HealthService = HealthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], HealthService);
//# sourceMappingURL=health.service.js.map