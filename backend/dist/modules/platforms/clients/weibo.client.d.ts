import { BasePlatformClient, PlatformToken } from './base-client';
import { PlatformApiConfig } from '../config/platform-config';
interface WeiboStatusList {
    statuses: Array<{
        id: number;
        text: string;
        created_at: string;
        reposts_count: number;
        comments_count: number;
        attitudes_count: number;
        pic_urls?: Array<{
            thumbnail_pic: string;
        }>;
        page_info?: {
            type: string;
            page_url: string;
        };
    }>;
    total_number: number;
    hasvisible: boolean;
    previous_cursor: number;
    next_cursor: number;
}
export declare class WeiboClient extends BasePlatformClient {
    constructor(config?: PlatformApiConfig);
    buildAuthorizeUrl(state: string): string;
    exchangeCode(code: string): Promise<PlatformToken>;
    protected refreshToken(): Promise<PlatformToken>;
    getUserInfo(): Promise<{
        platformUserId: string;
        nickname: string;
        avatar: string;
        bio: string | undefined;
        followers: number | undefined;
        following: number | undefined;
    }>;
    getStatusList(uid: string, page?: number, count?: number): Promise<WeiboStatusList>;
    getStatusData(ids: string[]): Promise<any>;
}
export {};
