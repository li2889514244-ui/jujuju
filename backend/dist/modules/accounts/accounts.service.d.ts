import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Platform } from '../../common/prisma-enums';
export declare class AccountsService {
    private prisma;
    private readonly logger;
    private readonly encryptionKey;
    constructor(prisma: PrismaService);
    private encryptCookie;
    private decryptCookie;
    create(dto: CreateAccountDto, userId: string): Promise<any>;
    findAll(params: {
        userId?: string;
        teamId?: string;
        groupId?: string;
        platform?: Platform;
        skip?: number;
        take?: number;
    }): Promise<{
        accounts: any[];
        total: number;
        skip: number;
        take: number;
    }>;
    findById(id: string, userId?: string): Promise<any>;
    update(id: string, dto: UpdateAccountDto, userId: string): Promise<any>;
    remove(id: string, userId: string): Promise<{
        success: boolean;
    }>;
    moveToGroup(accountId: string, groupId: string | null, userId: string): Promise<any>;
    getCookies(id: string, userId: string): Promise<{
        cookies: null;
    } | {
        cookies: string;
    }>;
    private sanitizeAccount;
}
