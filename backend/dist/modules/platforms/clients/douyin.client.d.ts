import { BasePlatformClient, PlatformToken } from './base-client';
import { PlatformApiConfig } from '../config/platform-config';
interface DouyinVideoList {
    data: {
        list: Array<{
            item_id: string;
            title: string;
            cover: string;
            create_time: number;
            statistics: {
                play_count: number;
                digg_count: number;
                comment_count: number;
                share_count: number;
            };
        }>;
        cursor: number;
        has_more: boolean;
    };
    error_code: number;
}
export declare class DouyinClient extends BasePlatformClient {
    constructor(config?: PlatformApiConfig);
    buildAuthorizeUrl(state: string): string;
    exchangeCode(code: string): Promise<PlatformToken>;
    protected refreshToken(): Promise<PlatformToken>;
    getUserInfo(): Promise<{
        platformUserId: string;
        nickname: string;
        avatar: string;
        bio?: string;
        followers?: number;
        following?: number;
    }>;
    getVideoList(cursor?: number, count?: number): Promise<DouyinVideoList>;
    getVideoData(itemIds: string[]): Promise<any>;
    protected extractData<T>(response: any): T;
}
export {};
