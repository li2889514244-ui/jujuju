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
        accounts: {
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            status: import(".prisma/client").$Enums.AccountStatus;
        }[];
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
    })[]>;
    findById(id: string): Promise<{
        accounts: {
            id: string;
            platform: import(".prisma/client").$Enums.PlatformEnum;
            nickname: string;
            avatar: string | null;
            followers: number;
            status: import(".prisma/client").$Enums.AccountStatus;
            owner: {
                name: string;
                id: string;
                email: string;
            };
        }[];
        organization: {
            name: string;
            id: string;
            plan: string;
        };
    } & {
        id: string;
        name: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
    }>;
    inviteMember(dto: InviteMemberDto, inviterId: string): Promise<{
        name: string;
        id: string;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        organization: {
            name: string;
            id: string;
        } | null;
    }>;
    updateMemberRole(organizationId: string, memberId: string, newRole: Role, operatorId: string): Promise<{
        name: string;
        id: string;
        email: string;
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
        id: string;
        createdAt: Date;
        avatar: string | null;
        status: import(".prisma/client").$Enums.AccountStatus;
        email: string;
        role: import(".prisma/client").$Enums.UserRole;
        lastLoginAt: Date | null;
    }[]>;
}
