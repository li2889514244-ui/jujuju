import { PrismaService } from '../../prisma/prisma.service';
import { NotificationType } from '@prisma/client';
export declare class NotificationsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    create(params: {
        userId: string;
        type: NotificationType;
        title: string;
        content?: string;
        metadata?: Record<string, any>;
    }): Promise<{
        id: string;
        type: import(".prisma/client").$Enums.NotificationType;
        title: string;
        content: string | null;
        read: boolean;
        metadata: import(".prisma/client").Prisma.JsonValue | null;
        createdAt: Date;
        userId: string;
    }>;
    findAll(userId: string, params: {
        skip?: number;
        take?: number;
        unreadOnly?: boolean;
    }): Promise<{
        notifications: {
            id: string;
            type: import(".prisma/client").$Enums.NotificationType;
            title: string;
            content: string | null;
            read: boolean;
            metadata: import(".prisma/client").Prisma.JsonValue | null;
            createdAt: Date;
            userId: string;
        }[];
        total: number;
        unreadCount: number;
        skip: number;
        take: number;
    }>;
    getUnreadCount(userId: string): Promise<{
        unreadCount: number;
    }>;
    markAsRead(id: string, userId: string): Promise<{
        success: boolean;
    }>;
    markAllAsRead(userId: string): Promise<{
        success: boolean;
        count: number;
    }>;
    remove(id: string, userId: string): Promise<{
        success: boolean;
    }>;
    clearRead(userId: string): Promise<{
        success: boolean;
        count: number;
    }>;
}
