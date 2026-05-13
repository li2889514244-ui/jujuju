import { BrowserService, BrowserInstance } from './browser.service';
declare class CreateBrowserInstanceDto {
    accountId: string;
}
export declare class BrowserController {
    private readonly browserService;
    constructor(browserService: BrowserService);
    getInstances(): BrowserInstance[];
    createInstance(dto: CreateBrowserInstanceDto): Promise<BrowserInstance>;
    closeInstance(id: string): Promise<{
        success: boolean;
    }>;
}
export {};
