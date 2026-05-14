import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { Role } from '../../common/prisma-enums';
export declare class TeamsController {
    private readonly teamsService;
    constructor(teamsService: TeamsService);
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
            status: string;
            platform: string;
            nickname: string;
        }[];
    } & {
        id: string;
        name: string;
        organizationId: string;
        createdAt: Date;
        updatedAt: Date;
    })[]>;
    getMembers(orgId: string): Promise<{
        name: string;
        email: string;
        id: string;
        avatar: string | null;
        role: string;
        status: string;
        lastLoginAt: Date | null;
        createdAt: Date;
    }[]>;
    inviteMember(dto: InviteMemberDto, userId: string): Promise<{
        organization: {
            name: string;
            id: string;
        } | null;
        name: string;
        email: string;
        id: string;
        role: string;
    }>;
    updateMemberRole(memberId: string, role: Role, userId: string, orgId: string): Promise<{
        name: string;
        email: string;
        id: string;
        role: string;
    }>;
    removeMember(memberId: string, userId: string, orgId: string): Promise<{
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
    findOne(id: string): Promise<{
        organization: {
            name: string;
            id: string;
            plan: string;
        };
        accounts: {
            id: string;
            avatar: string | null;
            status: string;
            platform: string;
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
}
