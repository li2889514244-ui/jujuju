export declare class AuthorizePlatformDto {
    platform: string;
    teamId?: string;
}
export declare class CollectDataDto {
    accountId: string;
    type?: 'account' | 'content' | 'daily';
}
export declare class BatchCollectDto {
    accountIds: string[];
    type?: 'account' | 'content' | 'daily';
}
export declare class PlatformFilterDto {
    platform?: string;
    teamId?: string;
    status?: string;
    skip?: number;
    take?: number;
}
