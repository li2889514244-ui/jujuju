import { PrismaService } from '../../prisma/prisma.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
export declare class AnalyticsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getDailyStats(dto: QueryAnalyticsDto): Promise<({
        account: {
            id: string;
            platform: string;
            nickname: string;
        };
    } & {
        id: string;
        date: Date;
        platform: string;
        followers: number;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        createdAt: Date;
        accountId: string;
    })[]>;
    getPostStats(dto: QueryAnalyticsDto): Promise<({
        post: {
            account: {
                id: string;
                platform: string;
                nickname: string;
            };
            title: string | null;
            id: string;
            status: string;
            platformUrl: string | null;
        };
    } & {
        id: string;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        collectedAt: Date;
        postId: string;
    })[]>;
    getOverview(userId: string): Promise<{
        accounts: {
            total: number;
            active: number;
            byPlatform: Record<string, number>;
            totalFollowers: number;
        };
        posts: {
            total: number;
            published: number;
            failed: number;
        };
        engagement: {
            totalViews: number;
            totalLikes: number;
            totalComments: number;
            totalShares: number;
            totalSaves: number;
        };
    }>;
    getPlatformComparison(userId: string): Promise<Record<string, any>>;
    generateReport(userId: string, params: {
        startDate?: Date;
        endDate?: Date;
        platform?: string;
    }): Promise<{
        period: {
            start: Date;
            end: Date;
        };
        overview: {
            accounts: {
                total: number;
                active: number;
                byPlatform: Record<string, number>;
                totalFollowers: number;
            };
            posts: {
                total: number;
                published: number;
                failed: number;
            };
            engagement: {
                totalViews: number;
                totalLikes: number;
                totalComments: number;
                totalShares: number;
                totalSaves: number;
            };
        };
        accounts: {
            dailyStats: ({
                account: {
                    platform: string;
                    nickname: string;
                };
            } & {
                id: string;
                date: Date;
                platform: string;
                followers: number;
                views: number;
                likes: number;
                comments: number;
                shares: number;
                createdAt: Date;
                accountId: string;
            })[];
            id: string;
            platform: string;
            nickname: string;
            followers: number;
        }[];
        topPosts: {
            id: string;
            title: string | null;
            platform: string;
            account: string;
            views: number;
            likes: number;
            comments: number;
            shares: number;
            publishedAt: Date;
        }[];
        dailyTrend: ({
            account: {
                platform: string;
                nickname: string;
            };
        } & {
            id: string;
            date: Date;
            platform: string;
            followers: number;
            views: number;
            likes: number;
            comments: number;
            shares: number;
            createdAt: Date;
            accountId: string;
        })[];
    }>;
    getComparison(userId: string): Promise<{
        weekOverWeek: {
            current: {
                views: number;
                likes: number;
                comments: number;
                shares: number;
                followers: number;
                posts: number;
            };
            previous: {
                views: number;
                likes: number;
                comments: number;
                shares: number;
                followers: number;
                posts: number;
            };
            change: Record<string, number | null>;
        };
        monthOverMonth: {
            current: {
                views: number;
                likes: number;
                comments: number;
                shares: number;
                followers: number;
                posts: number;
            };
            previous: {
                views: number;
                likes: number;
                comments: number;
                shares: number;
                followers: number;
                posts: number;
            };
            change: Record<string, number | null>;
        };
        yearOverYear: {
            current: {
                views: number;
                likes: number;
                comments: number;
                shares: number;
                followers: number;
                posts: number;
            };
            previous: {
                views: number;
                likes: number;
                comments: number;
                shares: number;
                followers: number;
                posts: number;
            };
            change: Record<string, number | null>;
        };
    }>;
    getViewsRanking(userId: string, params: {
        limit?: number;
        period?: 'week' | 'month' | 'all';
        platform?: string;
    }): Promise<{
        ranking: {
            rank: number;
            postId: string;
            title: string | null;
            platform: string;
            accountName: string;
            accountAvatar: string | null;
            views: number;
            likes: number;
            comments: number;
            shares: number;
            publishedAt: Date;
        }[];
        total: number;
        period: "week" | "month" | "all";
    }>;
    private aggregateStats;
    private calcChange;
    private getWeekStart;
}
