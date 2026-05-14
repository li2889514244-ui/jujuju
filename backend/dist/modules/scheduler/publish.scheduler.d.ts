import { ContentService } from '../content/content.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class PublishScheduler {
    private contentService;
    private notificationsService;
    private readonly logger;
    private isProcessing;
    constructor(contentService: ContentService, notificationsService: NotificationsService);
    handleScheduledPublish(): Promise<void>;
    private delay;
}
