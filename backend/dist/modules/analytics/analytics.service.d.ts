import { PrismaService } from '../../prisma/prisma.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
export declare class AnalyticsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getFollowersTrend(userId: string, days?: number, platform?: string, groupId?: string): Promise<{
        date: string;
        value: number;
    }[]>;
    getViewsTrend(userId: string, days?: number, platform?: string, groupId?: string): Promise<{
        date: string;
        value: number;
    }[]>;
    createManualMonetization(userId: string, dto: {
        date: string;
        platform: string;
        revenue?: number;
        gmv?: number;
        orders?: number;
        buyerCount?: number;
        commission?: number;
        avgOrderValue?: number;
    }): Promise<{
        id: string;
        date: Date;
        platform: import(".prisma/client").$Enums.PlatformEnum;
        followers: number;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        revenue: number;
        gmv: number;
        orders: number;
        commission: number;
        buyerCount: number;
        productCount: number;
        avgOrderValue: number;
        followersIncrement: number;
        viewsIncrement: number;
        likesIncrement: number;
        commentsIncrement: number;
        sharesIncrement: number;
        unfollows: number;
        createdAt: Date;
        accountId: string;
    }>;
    getDailyStats(dto: QueryAnalyticsDto, userId?: string): Promise<({
        account: {
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
        };
    } & {
        id: string;
        date: Date;
        platform: import(".prisma/client").$Enums.PlatformEnum;
        followers: number;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        revenue: number;
        gmv: number;
        orders: number;
        commission: number;
        buyerCount: number;
        productCount: number;
        avgOrderValue: number;
        followersIncrement: number;
        viewsIncrement: number;
        likesIncrement: number;
        commentsIncrement: number;
        sharesIncrement: number;
        unfollows: number;
        createdAt: Date;
        accountId: string;
    })[]>;
    getPostStats(dto: QueryAnalyticsDto, userId?: string): Promise<({
        post: {
            account: {
                id: string;
                platform: import(".prisma/client").$Enums.PlatformEnum;
                nickname: string;
            };
            title: string | null;
            id: string;
            status: import(".prisma/client").$Enums.PostStatus;
            platformUrl: string | null;
        };
    } & {
        id: string;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        completionRate: number;
        fiveSecCompletionRate: number;
        coverClickRate: number;
        avgPlayDuration: number;
        videoDuration: number;
        danmakuCount: number;
        dislikes: number;
        followsFromPost: number;
        collectedAt: Date;
        postId: string;
    })[]>;
    getOverview(userId: string, groupId?: string): Promise<{
        accounts: {
            total: number;
            active: number;
            byPlatform: Record<string, number>;
            totalFollowers: number;
            totalLikes: number;
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
            totalDanmaku: number;
            avgCompletionRate: number;
        };
    }>;
    getPlatformComparison(userId: string, groupId?: string): Promise<{
        platform: string;
        accounts: number;
        followers: number;
        likes: number;
        publishes: number;
        views: number;
        comments: number;
        shares: number;
        saves: number;
        engagementRate: number;
    }[]>;
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
                totalLikes: number;
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
                totalDanmaku: number;
                avgCompletionRate: number;
            };
        };
        accounts: {
            dailyStats: ({
                account: {
                    platform: import(".prisma/client").$Enums.PlatformEnum;
                    nickname: string;
                };
            } & {
                id: string;
                date: Date;
                platform: import(".prisma/client").$Enums.PlatformEnum;
                followers: number;
                views: number;
                likes: number;
                comments: number;
                shares: number;
                revenue: number;
                gmv: number;
                orders: number;
                commission: number;
                buyerCount: number;
                productCount: number;
                avgOrderValue: number;
                followersIncrement: number;
                viewsIncrement: number;
                likesIncrement: number;
                commentsIncrement: number;
                sharesIncrement: number;
                unfollows: number;
                createdAt: Date;
                accountId: string;
            })[];
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            followers: number;
            likes: number;
        }[];
        topPosts: {
            id: string;
            title: string | null;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            account: string;
            views: number;
            likes: number;
            comments: number;
            shares: number;
            saves: number;
            publishedAt: Date;
        }[];
        dailyTrend: {
            date: string;
            followers: number;
            views: number;
            likes: number;
            comments: number;
            shares: number;
        }[];
    }>;
    getComparison(userId: string, groupId?: string): Promise<{
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
        groupId?: string;
    }): Promise<{
        ranking: {
            rank: number;
            postId: string;
            title: string | null;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            accountName: string;
            accountAvatar: string | null;
            views: number;
            likes: number;
            comments: number;
            shares: number;
            completionRate: number;
            avgPlayDuration: number;
            engagementRate: number;
            publishedAt: Date;
        }[];
        total: number;
        period: "week" | "month" | "all";
    }>;
    private aggregateStats;
    private calcChange;
    private getWeekStart;
    getLikesTrend(userId: string, days?: number, platform?: string): Promise<{
        date: string;
        value: number;
    }[]>;
    getPublishEffect(userId: string, days?: number, contentId?: string, groupId?: string): Promise<{
        id: string;
        title: string | null;
        platform: import(".prisma/client").$Enums.PlatformEnum;
        accountName: string;
        status: import(".prisma/client").$Enums.PostStatus;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        saves: number;
        completionRate: number;
        avgPlayDuration: number;
        danmakuCount: number;
        followsFromPost: number;
        publishedAt: Date;
    }[]>;
    getEngagementRate(userId: string, days?: number, platform?: string, groupId?: string): Promise<{
        date: string;
        value: number;
    }[]>;
    exportReport(userId: string, startDate?: string, endDate?: string, format?: string): Promise<string | {
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
                totalLikes: number;
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
                totalDanmaku: number;
                avgCompletionRate: number;
            };
        };
        accounts: {
            dailyStats: ({
                account: {
                    platform: import(".prisma/client").$Enums.PlatformEnum;
                    nickname: string;
                };
            } & {
                id: string;
                date: Date;
                platform: import(".prisma/client").$Enums.PlatformEnum;
                followers: number;
                views: number;
                likes: number;
                comments: number;
                shares: number;
                revenue: number;
                gmv: number;
                orders: number;
                commission: number;
                buyerCount: number;
                productCount: number;
                avgOrderValue: number;
                followersIncrement: number;
                viewsIncrement: number;
                likesIncrement: number;
                commentsIncrement: number;
                sharesIncrement: number;
                unfollows: number;
                createdAt: Date;
                accountId: string;
            })[];
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            followers: number;
            likes: number;
        }[];
        topPosts: {
            id: string;
            title: string | null;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            account: string;
            views: number;
            likes: number;
            comments: number;
            shares: number;
            saves: number;
            publishedAt: Date;
        }[];
        dailyTrend: {
            date: string;
            followers: number;
            views: number;
            likes: number;
            comments: number;
            shares: number;
        }[];
    }>;
    getMonetization(userId: string, days?: number, platform?: string): Promise<{
        totalRevenue: number;
        totalGmv: number;
        totalOrders: number;
        totalCommission: number;
        totalBuyerCount: number;
        totalAvgOrderValue: number;
        byPlatform: any[];
        dailyTrend: {
            avgOrderValue: number;
            date: string;
            revenue: number;
            gmv: number;
            orders: number;
            commission: number;
            buyerCount: number;
        }[];
    }>;
    getAccountAnalytics(accountId: string): Promise<{
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalSaves: number;
        totalDanmaku: number;
        totalFollowsFromPost: number;
        avgCompletionRate: number;
        totalPosts: number;
        avgEngagementRate: number;
    }>;
    getAccountPosts(accountId: string, params: {
        page: number;
        pageSize: number;
        sortBy: string;
        sortOrder: 'asc' | 'desc';
    }): Promise<{
        items: {
            id: string;
            title: string | null;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            status: import(".prisma/client").$Enums.PostStatus;
            publishAt: string | null;
            createdAt: string;
            views: number;
            likes: number;
            comments: number;
            shares: number;
            saves: number;
            completionRate: number;
            avgPlayDuration: number;
            danmakuCount: number;
            followsFromPost: number;
            engagementRate: number;
            tags: string[];
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
    getTags(groupId?: string): Promise<{
        name: string;
        count: number;
    }[]>;
    getAccountDetailList(userId: string, platform?: string, groupId?: string): Promise<{
        id: string;
        nickname: string;
        avatar: string | null;
        platform: import(".prisma/client").$Enums.PlatformEnum;
        fans: number;
        info: {
            day_total: {
                play: number;
                like: number;
                comment: number;
                share: number;
                new_fans: number;
            };
            week_total: {
                play: number;
                like: number;
                comment: number;
                share: number;
                new_fans: number;
            };
            month_total: {
                play: number;
                like: number;
                comment: number;
                share: number;
                new_fans: number;
            };
        };
    }[]>;
}
