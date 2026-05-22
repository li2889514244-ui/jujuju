import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { Role } from '../../common/prisma-enums';
export declare class TeamsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    create(dto: CreateTeamDto, userId: string): Promise<{
        organization: {
            name: string;
            id: string;
        };
    } & {
        id: string;
        name: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    findAll(organizationId?: string): Promise<({
        organization: {
            name: string;
            id: string;
        };
        accounts: {
            id: string;
            status: import(".prisma/client").$Enums.AccountStatus;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
        }[];
    } & {
        id: string;
        name: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    findById(id: string): Promise<{
        organization: {
            name: string;
            id: string;
            plan: string;
        };
        accounts: {
            id: string;
            avatar: string | null;
            status: import(".prisma/client").$Enums.AccountStatus;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            followers: number;
            owner: {
                name: string;
                email: string;
                id: string;
            };
        }[];
    } & {
        id: string;
        name: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    inviteMember(dto: InviteMemberDto, inviterId: string): Promise<{
        organization: {
            name: string;
            id: string;
        } | null;
        name: string;
        email: string;
        id: string;
        role: import(".prisma/client").$Enums.UserRole;
    }>;
    updateMemberRole(organizationId: string, memberId: string, newRole: Role, operatorId: string): Promise<{
        name: string;
        email: string;
        id: string;
        role: import(".prisma/client").$Enums.UserRole;
    }>;
    removeMember(organizationId: string, memberId: string, operatorId: string): Promise<{
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
    getMembers(organizationId: string): Promise<{
        name: string;
        email: string;
        id: string;
        avatar: string | null;
        role: import(".prisma/client").$Enums.UserRole;
        status: import(".prisma/client").$Enums.AccountStatus;
        lastLoginAt: Date | null;
        createdAt: Date;
    }[]>;
}
