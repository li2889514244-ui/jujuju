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
                plan: import(".prisma/client").$Enums.Plan;
            } | null;
            name: string;
            email: string;
            phone: string | null;
            id: string;
            avatar: string | null;
            role: import(".prisma/client").$Enums.Role;
            status: import(".prisma/client").$Enums.UserStatus;
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
            status: import(".prisma/client").$Enums.OrgStatus;
            plan: import(".prisma/client").$Enums.Plan;
        } | null;
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.Role;
        status: import(".prisma/client").$Enums.UserStatus;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        accounts: {
            id: string;
            avatar: string | null;
            status: import(".prisma/client").$Enums.AccountStatus;
            platform: import(".prisma/client").$Enums.Platform;
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
        role: import(".prisma/client").$Enums.Role;
        status: import(".prisma/client").$Enums.UserStatus;
        updatedAt: Date;
    }>;
    remove(id: string): Promise<{
        id: string;
        email: string;
        phone: string | null;
        password: string;
        name: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.Role;
        status: import(".prisma/client").$Enums.UserStatus;
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
        role: import(".prisma/client").$Enums.Role;
        status: import(".prisma/client").$Enums.UserStatus;
        lastLoginAt: Date | null;
        createdAt: Date;
    }[]>;
}
