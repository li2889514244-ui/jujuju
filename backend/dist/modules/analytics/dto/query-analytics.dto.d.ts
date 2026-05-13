import { Platform } from '@prisma/client';
export declare class QueryAnalyticsDto {
    accountId?: string;
    platform?: Platform;
    startDate?: string;
    endDate?: string;
    granularity?: 'day' | 'week' | 'month';
}
