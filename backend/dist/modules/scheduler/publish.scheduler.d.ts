import { ContentService } from '../content/content.service';
import { UploaderService } from '../uploader/uploader.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class PublishScheduler {
    private contentService;
    private uploaderService;
    private notificationsService;
    private readonly logger;
    private isProcessing;
    constructor(contentService: ContentService, uploaderService: UploaderService, notificationsService: NotificationsService);
    handleScheduledPublish(): Promise<void>;
    private delay;
}
