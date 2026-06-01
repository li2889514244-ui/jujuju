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
            name: string;
            id: string;
            createdAt: Date;
            updatedAt: Date;
            avatar: string | null;
            status: import(".prisma/client").$Enums.AccountStatus;
            email: string;
            phone: string | null;
            role: import(".prisma/client").$Enums.UserRole;
            lastLoginAt: Date | null;
            organization: {
                name: string;
                id: string;
                plan: string;
            } | null;
        }[];
        total: number;
        skip: number;
        take: number;
    }>;
    findById(id: string): Promise<{
        name: string;
        accounts: {
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            avatar: string | null;
            followers: number;
            status: import(".prisma/client").$Enums.AccountStatus;
        }[];
        id: string;
        createdAt: Date;
        updatedAt: Date;
        avatar: string | null;
        status: import(".prisma/client").$Enums.AccountStatus;
        email: string;
        phone: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        lastLoginAt: Date | null;
        organization: {
            name: string;
            id: string;
            status: import(".prisma/client").$Enums.AccountStatus;
            plan: string;
        } | null;
    }>;
    update(id: string, data: Prisma.UserUpdateInput): Promise<{
        name: string;
        id: string;
        updatedAt: Date;
        avatar: string | null;
        status: import(".prisma/client").$Enums.AccountStatus;
        email: string;
        phone: string | null;
        role: import(".prisma/client").$Enums.UserRole;
    }>;
    remove(id: string): Promise<{
        id: string;
        email: string;
        phone: string | null;
        password: string;
        name: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.AccountStatus;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
    }>;
    findByOrganization(organizationId: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        avatar: string | null;
        status: import(".prisma/client").$Enums.AccountStatus;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        lastLoginAt: Date | null;
    }[]>;
}
