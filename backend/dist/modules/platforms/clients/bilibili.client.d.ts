import { BasePlatformClient, PlatformToken } from './base-client';
import { PlatformApiConfig } from '../config/platform-config';
interface BilibiliVideoList {
    code: number;
    message: string;
    data: {
        list: {
            vlist: Array<{
                bvid: string;
                aid: number;
                title: string;
                pic: string;
                created: number;
                play: number;
                like: number;
                comment: number;
                share: number;
                favorites: number;
            }>;
        };
        page: {
            pn: number;
            ps: number;
            count: number;
        };
    };
}
export declare class BilibiliClient extends BasePlatformClient {
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
    getVideoList(mid: number, pn?: number, ps?: number): Promise<BilibiliVideoList>;
    getVideoData(bvids: string[]): Promise<any>;
}
export {};
