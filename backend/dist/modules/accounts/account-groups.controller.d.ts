import { PrismaService } from '../../prisma/prisma.service';
declare class CreateGroupDto {
    name: string;
    color?: string;
    sortOrder?: number;
}
declare class UpdateGroupDto {
    name?: string;
    color?: string;
    sortOrder?: number;
}
export declare class AccountGroupsController {
    private prisma;
    constructor(prisma: PrismaService);
    create(dto: CreateGroupDto, userId: string): Promise<{
        id: string;
        name: string;
        color: string;
        sortOrder: number;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }>;
    findAll(userId: string): Promise<({
        _count: {
            accounts: number;
        };
    } & {
        id: string;
        name: string;
        color: string;
        sortOrder: number;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    })[]>;
    update(id: string, dto: UpdateGroupDto, userId: string): Promise<({
        _count: {
            accounts: number;
        };
    } & {
        id: string;
        name: string;
        color: string;
        sortOrder: number;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    }) | {
        success: boolean;
        message: string;
    }>;
    remove(id: string, userId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
    setAccounts(groupId: string, body: {
        accountIds: string[];
    }, userId: string): Promise<{
        success: boolean;
        count: number;
    }>;
}
export {};
