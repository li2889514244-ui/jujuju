export interface AccountMetrics {
    platform: string;
    platformUserId: string;
    nickname: string;
    followers: number;
    following: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    collectedAt: Date;
}
export interface ContentMetrics {
    contentId: string;
    title: string;
    platform: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    createdAt: Date;
    collectedAt: Date;
}
export interface DailyMetrics {
    platform: string;
    platformUserId: string;
    date: Date;
    followers: number;
    views: number;
    likes: number;
    comments: number;
    shares: number;
}
export interface CollectorResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    collectedAt: Date;
}
export interface IDataCollector {
    readonly platform: string;
    collectAccountMetrics(accountId: string): Promise<CollectorResult<AccountMetrics>>;
    collectContentMetrics(accountId: string, options?: {
        cursor?: string;
        limit?: number;
    }): Promise<CollectorResult<ContentMetrics[]>>;
    collectDailyMetrics(accountId: string): Promise<CollectorResult<DailyMetrics>>;
}
