import { PrismaService } from '../../prisma/prisma.service';
import { Platform } from '../../common/prisma-enums';
export declare class CompetitorsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    create(data: {
        platform: Platform;
        platformUserId: string;
        nickname: string;
        avatar?: string;
        bio?: string;
        note?: string;
        userId: string;
    }): Promise<{
        id: string;
        platform: import(".prisma/client").$Enums.PlatformEnum;
        platformUserId: string;
        nickname: string;
        avatar: string | null;
        bio: string | null;
        followers: number;
        following: number;
        status: import(".prisma/client").$Enums.AccountStatus;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    findAll(userId: string, params?: {
        platform?: Platform;
        skip?: number;
        take?: number;
    }): Promise<{
        competitors: ({
            snapshots: {
                id: string;
                date: Date;
                followers: number;
                views: number;
                likes: number;
                comments: number;
                posts: number;
                createdAt: Date;
                competitorId: string;
            }[];
        } & {
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            platformUserId: string;
            nickname: string;
            avatar: string | null;
            bio: string | null;
            followers: number;
            following: number;
            status: import(".prisma/client").$Enums.AccountStatus;
            note: string | null;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
        })[];
        total: number;
        skip: number;
        take: number;
    }>;
    findById(id: string, userId: string): Promise<{
        snapshots: {
            id: string;
            date: Date;
            followers: number;
            views: number;
            likes: number;
            comments: number;
            posts: number;
            createdAt: Date;
            competitorId: string;
        }[];
    } & {
        id: string;
        platform: import(".prisma/client").$Enums.PlatformEnum;
        platformUserId: string;
        nickname: string;
        avatar: string | null;
        bio: string | null;
        followers: number;
        following: number;
        status: import(".prisma/client").$Enums.AccountStatus;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    remove(id: string, userId: string): Promise<{
        success: boolean;
    }>;
    recordSnapshot(competitorId: string, data: {
        followers: number;
        views: number;
        likes: number;
        comments: number;
        posts: number;
    }): Promise<{
        id: string;
        date: Date;
        followers: number;
        views: number;
        likes: number;
        comments: number;
        posts: number;
        createdAt: Date;
        competitorId: string;
    }>;
    compare(userId: string, competitorIds: string[], days?: number): Promise<({
        snapshots: {
            id: string;
            date: Date;
            followers: number;
            views: number;
            likes: number;
            comments: number;
            posts: number;
            createdAt: Date;
            competitorId: string;
        }[];
    } & {
        id: string;
        platform: import(".prisma/client").$Enums.PlatformEnum;
        platformUserId: string;
        nickname: string;
        avatar: string | null;
        bio: string | null;
        followers: number;
        following: number;
        status: import(".prisma/client").$Enums.AccountStatus;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    })[]>;
}
