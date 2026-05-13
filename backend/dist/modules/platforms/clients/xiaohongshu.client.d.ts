import { BasePlatformClient, PlatformToken } from './base-client';
import { PlatformApiConfig } from '../config/platform-config';
interface XiaohongshuNoteList {
    code: number;
    msg: string;
    data: {
        notes: Array<{
            note_id: string;
            title: string;
            cover: string;
            create_time: number;
            stats: {
                view_count: number;
                like_count: number;
                comment_count: number;
                share_count: number;
                collect_count: number;
            };
        }>;
        cursor: string;
        has_more: boolean;
    };
}
export declare class XiaohongshuClient extends BasePlatformClient {
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
    getNoteList(cursor?: string, limit?: number): Promise<XiaohongshuNoteList>;
    getNoteData(noteIds: string[]): Promise<any>;
}
export {};
