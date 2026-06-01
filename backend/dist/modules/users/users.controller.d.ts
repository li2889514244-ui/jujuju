import { UsersService } from './users.service';
import { Role } from '../../common/prisma-enums';
import { PrismaService } from '../../prisma/prisma.service';
declare class UpdateUserDto {
    name?: string;
    phone?: string;
    avatar?: string;
}
export declare class UsersController {
    private readonly usersService;
    private readonly prisma;
    constructor(usersService: UsersService, prisma: PrismaService);
    findAll(page?: number, limit?: number, search?: string): Promise<{
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
    getProfile(userId: string): Promise<{
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
    findOne(id: string, currentUserId: string, currentRole: Role): Promise<{
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
    updateProfile(userId: string, dto: UpdateUserDto): Promise<{
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
}
export {};
