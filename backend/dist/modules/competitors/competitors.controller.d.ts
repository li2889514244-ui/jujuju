import { CompetitorsService } from './competitors.service';
import { Platform } from '../../common/prisma-enums';
export declare class CompetitorsController {
    private readonly competitorsService;
    constructor(competitorsService: CompetitorsService);
    create(userId: string, dto: {
        platform: Platform;
        platformUserId: string;
        nickname: string;
        avatar?: string;
        bio?: string;
        note?: string;
    }): Promise<{
        id: string;
        platform: string;
        platformUserId: string;
        nickname: string;
        avatar: string | null;
        bio: string | null;
        followers: number;
        following: number;
        status: string;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    findAll(userId: string, platform?: Platform, skip?: string, take?: string): Promise<{
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
            platform: string;
            platformUserId: string;
            nickname: string;
            avatar: string | null;
            bio: string | null;
            followers: number;
            following: number;
            status: string;
            note: string | null;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
        })[];
        total: number;
        skip: number;
        take: number;
    }>;
    compare(userId: string, ids: string, days?: string): Promise<({
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
        platform: string;
        platformUserId: string;
        nickname: string;
        avatar: string | null;
        bio: string | null;
        followers: number;
        following: number;
        status: string;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    })[]>;
    findById(userId: string, id: string): Promise<{
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
        platform: string;
        platformUserId: string;
        nickname: string;
        avatar: string | null;
        bio: string | null;
        followers: number;
        following: number;
        status: string;
        note: string | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    remove(userId: string, id: string): Promise<{
        success: boolean;
    }>;
}
