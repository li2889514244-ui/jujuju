import { AccountStatus } from '@prisma/client';
export declare class UpdateAccountDto {
    nickname?: string;
    avatar?: string;
    bio?: string;
    cookies?: string;
    proxyConfig?: Record<string, any>;
    status?: AccountStatus;
    followers?: number;
    likes?: number;
    following?: number;
    teamId?: string;
}
