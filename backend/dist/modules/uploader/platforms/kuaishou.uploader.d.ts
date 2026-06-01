import { OnModuleInit } from '@nestjs/common';
import { BaseUploader, PublishTask, PublishResult, StoredCookie, LoginStatus } from '../base-uploader';
import { BrowserPool } from '../browser-pool';
import { CookieManager } from '../cookie-manager';
import { UploaderService } from '../uploader.service';
export declare class KuaishouUploader extends BaseUploader implements OnModuleInit {
    private browserPool;
    private cookieManager;
    private uploaderService;
    private readonly logger;
    readonly platform: "KUAISHOU";
    readonly name = "";
    private readonly CREATOR_URL;
    private readonly PUBLISH_URL;
    constructor(browserPool: BrowserPool, cookieManager: CookieManager, uploaderService: UploaderService);
    onModuleInit(): void;
    getCreatorUrl(): string;
    checkLogin(cookies: StoredCookie[]): Promise<LoginStatus>;
    login(accountId: string): Promise<StoredCookie[]>;
    publish(task: PublishTask, cookies: StoredCookie[]): Promise<PublishResult>;
    private waitForUpload;
    private downloadFile;
}
