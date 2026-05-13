import { PrismaService } from '../../prisma/prisma.service';
export interface HealthCheckResult {
    status: 'ok' | 'error';
    timestamp: string;
    uptime: number;
    version: string;
    checks?: {
        database: {
            status: 'ok' | 'error';
            responseTime?: number;
            error?: string;
        };
        memory: {
            status: 'ok' | 'error';
            usedMB: number;
            totalMB: number;
            percentage: number;
        };
    };
}
export declare class HealthService {
    private prisma;
    private readonly logger;
    private readonly startTime;
    constructor(prisma: PrismaService);
    check(): Promise<HealthCheckResult>;
    private checkDatabase;
    private checkMemory;
}
