import { Platform } from '../../../common/prisma-enums';
export declare class CreateAccountDto {
    platform: Platform;
    platformUserId: string;
    nickname: string;
    avatar?: string;
    bio?: string;
    cookies?: string;
    proxyConfig?: Record<string, any>;
    teamId?: string;
}
