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
            role: import(".prisma/client").$Enums.UserRole;
            status: import(".prisma/client").$Enums.AccountStatus;
            lastLoginAt: Date | null;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        skip: number;
        take: number;
    }>;
    getProfile(userId: string): Promise<{
        organization: {
            name: string;
            id: string;
            status: import(".prisma/client").$Enums.AccountStatus;
            plan: string;
        } | null;
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.AccountStatus;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        accounts: {
            id: string;
            avatar: string | null;
            status: import(".prisma/client").$Enums.AccountStatus;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            followers: number;
        }[];
    }>;
    findOne(id: string, currentUserId: string, currentRole: Role): Promise<{
        organization: {
            name: string;
            id: string;
            status: import(".prisma/client").$Enums.AccountStatus;
            plan: string;
        } | null;
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.AccountStatus;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        accounts: {
            id: string;
            avatar: string | null;
            status: import(".prisma/client").$Enums.AccountStatus;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            followers: number;
        }[];
    }>;
    updateProfile(userId: string, dto: UpdateUserDto): Promise<{
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.AccountStatus;
        updatedAt: Date;
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
