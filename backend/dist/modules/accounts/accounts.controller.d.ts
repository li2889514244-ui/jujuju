import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Platform } from '../../common/prisma-enums';
export declare class AccountsController {
    private readonly accountsService;
    constructor(accountsService: AccountsService);
    create(dto: CreateAccountDto, userId: string): Promise<any>;
    findAll(platform?: Platform, teamId?: string, groupId?: string, page?: number, limit?: number, userId?: string): Promise<{
        accounts: any[];
        total: number;
        skip: number;
        take: number;
    }>;
    findOne(id: string): Promise<any>;
    getCookies(id: string, userId: string): Promise<{
        cookies: null;
    } | {
        cookies: string;
    }>;
    update(id: string, dto: UpdateAccountDto, userId: string): Promise<any>;
    remove(id: string, userId: string): Promise<{
        success: boolean;
    }>;
}
