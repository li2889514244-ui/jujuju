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
            this.logger.warn('检测到旧格式 CBC 加密 Cookie，建议重新设置以升级为 GCM');
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
        const existing = await this.prisma.account.findUnique({
            where: {
                platform_platformUserId: {
                    platform: dto.platform,
                    platformUserId: dto.platformUserId,
                },
            },
        });
        if (existing) {
            throw new common_1.ConflictException('该平台账号已存在');
        }
        const encryptedCookies = dto.cookies
            ? this.encryptCookie(dto.cookies)
            : null;
        const account = await this.prisma.account.create({
            data: {
                platform: dto.platform,
                platformUserId: dto.platformUserId,
                nickname: dto.nickname,
                avatar: dto.avatar,
                bio: dto.bio,
                cookies: encryptedCookies,
                proxyConfig: dto.proxyConfig || undefined,
                teamId: dto.teamId,
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
        if (userId)
            where.userId = userId;
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
        if (userId && account.userId !== userId) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
                throw new common_1.ForbiddenException('无权查看此账号');
            }
        }
        return this.sanitizeAccount(account);
    }
    async update(id, dto, userId) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        if (account.userId !== userId) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
                throw new common_1.ForbiddenException('无权修改此账号');
            }
        }
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
        if (account.userId !== userId) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
                throw new common_1.ForbiddenException('无权删除此账号');
            }
        }
        await this.prisma.account.delete({ where: { id } });
        this.logger.log(`账号已删除: ${id}`);
        return { success: true };
    }
    async getCookies(id, userId) {
        const account = await this.prisma.account.findUnique({ where: { id } });
        if (!account) {
            throw new common_1.NotFoundException('账号不存在');
        }
        if (account.userId !== userId) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
                throw new common_1.ForbiddenException('无权查看此账号Cookie');
            }
        }
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


/** Bulk delete accounts owned by user */
AccountsService.prototype.bulkDelete = async function(ids, userId) {
    return this.prisma.account.deleteMany({
        where: { id: { in: ids }, userId: userId }
    });
};

/** Bulk move accounts to a group */
AccountsService.prototype.bulkMove = async function(ids, groupId, userId) {
    return this.prisma.account.updateMany({
        where: { id: { in: ids }, userId: userId },
        data: { groupId: groupId }
    });
};

//# sourceMappingURL=accounts.service.js.map