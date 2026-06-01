import { PrismaService } from '../../prisma/prisma.service';
import { QueryAnalyticsDto } from './dto/query-analytics.dto';
export declare class AnalyticsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getFollowersTrend(userId: string, days?: number, platform?: string): Promise<{
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
        createdAt: Date;
        accountId: string;
    }>;
    getDailyStats(dto: QueryAnalyticsDto): Promise<({
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
        createdAt: Date;
        accountId: string;
    })[]>;
    getPostStats(dto: QueryAnalyticsDto): Promise<({
        post: {
            id: string;
            status: import(".prisma/client").$Enums.PostStatus;
            account: {
                id: string;
                platform: import(".prisma/client").$Enums.PlatformEnum;
                nickname: string;
            };
            title: string | null;
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
                createdAt: Date;
                accountId: string;
            })[];
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            followers: number;
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
            publishedAt: Date;
        }[];
        dailyTrend: ({
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
            platform: import(".prisma/client").$Enums.PlatformEnum;
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
    getLikesTrend(userId: string, days?: number, platform?: string): Promise<{
        date: string;
        value: number;
    }[]>;
    getPublishEffect(userId: string, days?: number, contentId?: string): Promise<{
        id: string;
        title: string | null;
        platform: import(".prisma/client").$Enums.PlatformEnum;
        accountName: string;
        status: import(".prisma/client").$Enums.PostStatus;
        views: number;
        likes: number;
        comments: number;
        shares: number;
        publishedAt: Date;
    }[]>;
    getEngagementRate(userId: string, days?: number, platform?: string): Promise<{
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
                createdAt: Date;
                accountId: string;
            })[];
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            followers: number;
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
            publishedAt: Date;
        }[];
        dailyTrend: ({
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
            createdAt: Date;
            accountId: string;
        })[];
    }>;
    getMonetization(userId: string, days?: number, platform?: string): Promise<{
        totalRevenue: number;
        totalGmv: number;
        totalOrders: number;
        totalCommission: number;
        totalBuyerCount: number;
        totalAvgOrderValue: number;
        byPlatform: any[];
        dailyTrend: any[];
    }>;
    getAccountAnalytics(accountId: string): Promise<{
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalSaves: number;
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
            engagementRate: number;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    }>;
}
