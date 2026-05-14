import { PrismaService } from '../../prisma/prisma.service';
import { CreateContentDto } from './dto/create-content.dto';
import { PostStatus } from '../../common/prisma-enums';
export declare class ContentService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    create(dto: CreateContentDto, userId: string): Promise<{
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: string;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    findAll(params: {
        userId?: string;
        accountId?: string;
        status?: PostStatus;
        platform?: string;
        skip?: number;
        take?: number;
    }): Promise<{
        posts: ({
            account: {
                id: string;
                avatar: string | null;
                platform: string;
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
            status: string;
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
    findById(id: string, userId?: string): Promise<{
        account: {
            id: string;
            avatar: string | null;
            platform: string;
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
        status: string;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    update(id: string, data: Partial<CreateContentDto>, userId: string): Promise<{
        account: {
            id: string;
            platform: string;
            nickname: string;
        };
    } & {
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: string;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    remove(id: string, userId: string): Promise<{
        success: boolean;
    }>;
    publish(contentId: string, userId: string): Promise<{
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: string;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    updatePublishStatus(contentId: string, status: PostStatus, platformUrl?: string, errorMsg?: string): Promise<{
        id: string;
        title: string | null;
        content: string | null;
        mediaUrls: string | null;
        tags: string | null;
        publishAt: Date | null;
        status: string;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    }>;
    getScheduledPosts(): Promise<({
        account: {
            id: string;
            platform: string;
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
        status: string;
        platformUrl: string | null;
        errorMsg: string | null;
        metadata: string | null;
        createdAt: Date;
        updatedAt: Date;
        accountId: string;
    })[]>;
    claimForPublish(postId: string): Promise<boolean>;
    batchPublish(dto: {
        title: string;
        content: string;
        mediaUrls?: string[];
        tags?: string[];
        accountIds: string[];
        publishAt?: string;
    }, userId: string): Promise<{
        success: boolean;
        count: number;
        posts: {
            id: string;
            title: string | null;
            content: string | null;
            mediaUrls: string | null;
            tags: string | null;
            publishAt: Date | null;
            status: string;
            platformUrl: string | null;
            errorMsg: string | null;
            metadata: string | null;
            createdAt: Date;
            updatedAt: Date;
            accountId: string;
        }[];
    }>;
}
