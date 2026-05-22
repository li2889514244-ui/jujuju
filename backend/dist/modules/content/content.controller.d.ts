import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { PostStatus } from '@prisma/client';
export declare class ContentController {
    private readonly contentService;
    constructor(contentService: ContentService);
    create(dto: CreateContentDto, userId: string): Promise<{
        account: {
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
        };
    } & {
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: import(".prisma/client").$Enums.PostStatus;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    findAll(accountId?: string, status?: PostStatus, page?: number, limit?: number, userId?: string): Promise<{
        posts: ({
            account: {
                id: string;
                avatar: string | null;
                platform: import(".prisma/client").$Enums.PlatformEnum;
                nickname: string;
            };
            stats: {
                id: string;
                views: number;
                likes: number;
                comments: number;
                shares: number;
                saves: number;
                collectedAt: Date;
                postId: string;
            } | null;
        } & {
            id: string;
            title: string | null;
            content: string | null;
            mediaUrls: string | null;
            tags: string | null;
            publishAt: Date | null;
            status: import(".prisma/client").$Enums.PostStatus;
            platformUrl: string | null;
            errorMsg: string | null;
            metadata: string | null;
            createdAt: Date;
            updatedAt: Date;
            accountId: string;
        })[];
        total: number;
        skip: number;
        take: number;
    }>;
    getScheduled(): Promise<({
        account: {
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            userId: string;
        };
    } & {
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: import(".prisma/client").$Enums.PostStatus;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    })[]>;
    findOne(id: string): Promise<{
        account: {
            id: string;
            avatar: string | null;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            userId: string;
        };
        stats: {
            id: string;
            views: number;
            likes: number;
            comments: number;
            shares: number;
            saves: number;
            collectedAt: Date;
            postId: string;
        } | null;
    } & {
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: import(".prisma/client").$Enums.PostStatus;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    update(id: string, dto: Partial<CreateContentDto>, userId: string): Promise<{
        account: {
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
        };
    } & {
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: import(".prisma/client").$Enums.PostStatus;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    publish(id: string, userId: string): Promise<{
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: import(".prisma/client").$Enums.PostStatus;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    batchPublish(userId: string, dto: {
        title: string;
        content: string;
        mediaUrls?: string[];
        tags?: string[];
        accountIds: string[];
        publishAt?: string;
    }): Promise<{
        success: boolean;
        count: number;
        posts: ({
            account: {
                id: string;
                platform: import(".prisma/client").$Enums.PlatformEnum;
                nickname: string;
            };
        } & {
            id: string;
            title: string | null;
            content: string | null;
            mediaUrls: string | null;
            tags: string | null;
            publishAt: Date | null;
            status: import(".prisma/client").$Enums.PostStatus;
            platformUrl: string | null;
            errorMsg: string | null;
            metadata: string | null;
            createdAt: Date;
            updatedAt: Date;
            accountId: string;
        })[];
    }>;
    remove(id: string, userId: string): Promise<{
        success: boolean;
    }>;
}
