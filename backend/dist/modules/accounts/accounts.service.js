"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AccountsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AccountsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const crypto = require("crypto");
const ownership_helper_1 = require("../../common/utils/ownership.helper");
let AccountsService = AccountsService_1 = class AccountsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AccountsService_1.name);
        const key = process.env.COOKIE_ENCRYPTION_KEY;
        if (!key || key.length < 32) {
            throw new Error('FATAL: COOKIE_ENCRYPTION_KEY environment variable is required and must be at least 32 characters.');
        }
        this.encryptionKey = key;
    }
    encryptCookie(text) {
        const iv = crypto.randomBytes(16);
        const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return iv.toString('hex') + ':' + authTag + ':' + encrypted;
    }
    decryptCookie(text) {
        const parts = text.split(':');
        if (parts.length === 2) {
            this.logger.warn('检测到旧版 CBC 加密格式，建议重新保存 Cookie 以迁移到 GCM');
            const [ivHex, encrypted] = parts;
            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        const [ivHex, authTagHex, encrypted] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    async create(dto, userId) {
        const encryptedCookies = dto.cookies ? this.encryptCookie(dto.cookies) : null;
        const account = await this.prisma.account.upsert({
            where: {
                platform_platformUserId: {
                    platform: dto.platform,
                    platformUserId: dto.platformUserId,
                },
            },
            create: {
                platform: dto.platform,
                platformUserId: dto.platformUserId,
                nickname: dto.nickname,
                avatar: dto.avatar,
                bio: dto.bio,
                cookies: encryptedCookies,
                proxyConfig: dto.proxyConfig ? JSON.stringify(dto.proxyConfig) : undefined,
                teamId: dto.teamId,
                userId,
            },
            update: {
                nickname: dto.nickname,
                avatar: dto.avatar,
                bio: dto.bio,
                cookies: encryptedCookies ?? undefined,
                proxyConfig: dto.proxyConfig ? JSON.stringify(dto.proxyConfig) : undefined,
                userId,
            },
            include: {
                owner: {
                    select: { id: true, name: true, email: true },
                },
                team: {
                    select: { id: true, name: true },
                },
            },
        });
        this.logger.log(`账号创建成功: ${dto.platform} - ${dto.nickname} (${account.id})`);
        return this.sanitizeAccount(account);
    }
    async findAll(params) {
        const { userId, teamId, groupId, platform, skip = 0, take = 20 } = params;
        const where = {};
        if (teamId)
            where.teamId = teamId;
        if (groupId)
            where.groupId = groupId;
        if (platform)
            where.platform = platform;
        const [accounts, total] = await Promise.all([
            this.prisma.account.findMany({
                where,
                skip,
                take,
                include: {
                    owner: {
                        select: { id: true, name: true, email: true },
                    },
                    team: {
                        select: { id: true, name: true },
                    },
                    _count: {
                        select: { posts: true },
                    },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.account.count({ where }),
        ]);
        return {
            accounts: accounts.map((a) => this.sanitizeAccount(a)),
            total,
            skip,
            take,
        };
    }
    async findById(id, userId) {
        const account = await this.prisma.account.findUnique({
            where: { id },
            include: {
                owner: {
                    select: { id: true, name: true, email: true },
                },
                team: {
                    select: { id: true, name: true },
                },
                posts: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        publishAt: true,
                        createdAt: true,
                    },
                },
                _count: {
                    select: { posts: true },
                },
            },
        });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        if (userId) {
            await ownership_helper_1.OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');
        }
        return this.sanitizeAccount(account);
    }
    async update(id, dto, userId) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        await ownership_helper_1.OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');
        const updateData = { ...dto };
        if (dto.cookies) {
            updateData.cookies = this.encryptCookie(dto.cookies);
        }
        const updated = await this.prisma.account.update({
            where: { id },
            data: updateData,
            include: {
                owner: {
                    select: { id: true, name: true, email: true },
                },
                team: {
                    select: { id: true, name: true },
                },
            },
        });
        return this.sanitizeAccount(updated);
    }
    async remove(id, userId) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        await ownership_helper_1.OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');
        await this.prisma.$transaction([
            this.prisma.postStats.deleteMany({ where: { post: { accountId: id } } }),
            this.prisma.post.deleteMany({ where: { accountId: id } }),
            this.prisma.dailyStats.deleteMany({ where: { accountId: id } }),
            this.prisma.account.delete({ where: { id } }),
        ]);
        this.logger.log(`账号已删除: ${id}`);
        return { success: true };
    }
    async moveToGroup(accountId, groupId, userId) {
        const account = await this.prisma.account.findUnique({ where: { id: accountId } });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        await ownership_helper_1.OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');
        if (groupId) {
            const group = await this.prisma.accountGroup.findFirst({
                where: { id: groupId, userId },
            });
            if (!group) {
                throw new common_1.NotFoundException('分组不存在或无权操作');
            }
        }
        const updated = await this.prisma.account.update({
            where: { id: accountId },
            data: { groupId },
            include: {
                owner: { select: { id: true, name: true, email: true } },
                team: { select: { id: true, name: true } },
                group: { select: { id: true, name: true, color: true } },
            },
        });
        this.logger.log(`账号 ${account.nickname} 移动到分组 ${groupId ?? '未分组'}`);
        return this.sanitizeAccount(updated);
    }
    async getCookies(id, userId) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        await ownership_helper_1.OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, account.userId, '账号');
        if (!account.cookies) {
            return { cookies: null };
        }
        return { cookies: this.decryptCookie(account.cookies) };
    }
    sanitizeAccount(account) {
        const { cookies, ...rest } = account;
        return {
            ...rest,
            hasCookies: !!cookies,
        };
    }
};
exports.AccountsService = AccountsService;
exports.AccountsService = AccountsService = AccountsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AccountsService);
//# sourceMappingURL=accounts.service.js.map