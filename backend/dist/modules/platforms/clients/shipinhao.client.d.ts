import { BasePlatformClient, PlatformToken } from './base-client';
import { PlatformApiConfig } from '../config/platform-config';
interface ShipinhaoVideoList {
    errcode: number;
    errmsg: string;
    data: {
        video_list: Array<{
            video_id: string;
            title: string;
            cover_url: string;
            create_time: number;
            stats: {
                view_count: number;
                like_count: number;
                comment_count: number;
                share_count: number;
                favorite_count: number;
            };
        }>;
        next_cursor: string;
        has_more: boolean;
    };
}
export declare class ShipinhaoClient extends BasePlatformClient {
    constructor(config?: PlatformApiConfig);
    buildAuthorizeUrl(state: string): string;
    exchangeCode(code: string): Promise<PlatformToken>;
    protected refreshToken(): Promise<PlatformToken>;
    getUserInfo(): Promise<{
        platformUserId: string;
        nickname: string;
        avatar: string;
    }>;
    getVideoList(cursor?: string, count?: number): Promise<ShipinhaoVideoList>;
    getVideoData(videoIds: string[]): Promise<any>;
}
export {};
