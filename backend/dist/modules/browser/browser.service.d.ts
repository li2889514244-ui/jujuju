export interface BrowserInstance {
    id: string;
    status: 'idle' | 'busy' | 'error';
    accountId?: string;
    startedAt: Date;
}
export declare class BrowserService {
    private readonly logger;
    getInstances(): BrowserInstance[];
    createInstance(_accountId: string): Promise<BrowserInstance>;
    closeInstance(_instanceId: string): Promise<void>;
    setCookies(_instanceId: string, _cookies: string): Promise<void>;
    executePublish(_instanceId: string, _platform: string, _content: {
        title?: string;
        content?: string;
        mediaUrls?: string[];
    }): Promise<{
        success: boolean;
        platformUrl?: string;
        error?: string;
    }>;
    screenshot(_instanceId: string): Promise<string | null>;
}
