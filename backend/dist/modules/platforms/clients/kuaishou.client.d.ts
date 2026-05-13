import { BasePlatformClient, PlatformToken } from './base-client';
import { PlatformApiConfig } from '../config/platform-config';
interface KuaishouVideoList {
    result: number;
    data: {
        list: Array<{
            photo_id: string;
            caption: string;
            cover_url: string;
            create_time: number;
            view_count: number;
            like_count: number;
            comment_count: number;
            share_count: number;
        }>;
        total_count: number;
        pcursor: string;
    };
    error_msg?: string;
}
export declare class KuaishouClient extends BasePlatformClient {
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
    getVideoList(pcursor?: string, count?: number): Promise<KuaishouVideoList>;
    getVideoData(photoIds: string[]): Promise<any>;
}
export {};
