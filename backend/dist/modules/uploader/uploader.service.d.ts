import { Platform } from '../../common/prisma-enums';
import { BaseUploader, PublishTask, PublishResult } from './base-uploader';
import { CookieManager } from './cookie-manager';
import { ContentService } from '../content/content.service';
export declare class UploaderService {
    private cookieManager;
    private contentService;
    private readonly logger;
    private readonly uploaders;
    constructor(cookieManager: CookieManager, contentService: ContentService);
    registerUploader(uploader: BaseUploader): void;
    getRegisteredPlatforms(): Platform[];
    executePublish(task: PublishTask): Promise<PublishResult>;
    executeBatchPublish(tasks: PublishTask[]): Promise<PublishResult[]>;
    private delay;
}
