import { NotificationsService } from './notifications.service';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    findAll(userId: string, page?: number, limit?: number, unreadOnly?: string): Promise<{
        notifications: {
            id: string;
            type: string;
            title: string;
            content: string | null;
            read: boolean;
            metadata: string | null;
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
