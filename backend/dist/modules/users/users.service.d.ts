import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
export declare class UsersService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    findAll(params: {
        skip?: number;
        take?: number;
        where?: Prisma.UserWhereInput;
        orderBy?: Prisma.UserOrderByWithRelationInput;
    }): Promise<{
        users: {
            organization: {
                name: string;
                id: string;
                plan: string;
            } | null;
            name: string;
            email: string;
            phone: string | null;
            id: string;
            avatar: string | null;
            role: string;
            status: string;
            lastLoginAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        skip: number;
        take: number;
    }>;
    findById(id: string): Promise<{
        organization: {
            name: string;
            id: string;
            status: string;
            plan: string;
        } | null;
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: string;
        status: string;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        accounts: {
            id: string;
            avatar: string | null;
            status: string;
            platform: string;
            nickname: string;
            followers: number;
        }[];
    }>;
    update(id: string, data: Prisma.UserUpdateInput): Promise<{
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: string;
        status: string;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<{
        id: string;
        email: string;
        phone: string | null;
        password: string;
        name: string;
        avatar: string | null;
        role: string;
        status: string;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
    }>;
    findByOrganization(organizationId: string): Promise<{
        name: string;
        email: string;
        id: string;
        avatar: string | null;
        role: string;
        status: string;
        lastLoginAt: Date | null;
        createdAt: Date;
    }[]>;
}
