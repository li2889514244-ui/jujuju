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
export declare class ReportMetricsDto {
    accountId: string;
    metrics: Record<string, any>;
    date?: string;
}
export declare class ReportPostStatItem {
    title?: string;
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    completionRate?: number;
    fiveSecCompletionRate?: number;
    coverClickRate?: number;
    avgPlayDuration?: number;
    videoDuration?: number;
    danmakuCount?: number;
    dislikes?: number;
    followsFromPost?: number;
    coverUrl?: string;
    publishedAt?: string;
    date?: string;
}
export declare class ReportPostStatsDto {
    accountId: string;
    posts: ReportPostStatItem[];
}
export declare class PlatformFilterDto {
    platform?: string;
    teamId?: string;
    status?: string;
    skip?: number;
    take?: number;
}
