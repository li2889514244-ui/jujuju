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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ContentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let ContentService = ContentService_1 = class ContentService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ContentService_1.name);
    }
    async create(dto, userId) {
        const account = await this.prisma.account.findUnique({
            where: { id: dto.accountId },
        });
        if (!account) {
            throw new common_1.NotFoundException('关联账号不存在');
        }
        if (account.userId !== userId) {
            throw new common_1.ForbiddenException('无权为此账号创建内容');
        }
        const post = await this.prisma.post.create({
            data: {
                title: dto.title,
                content: dto.content,
                mediaUrls: dto.mediaUrls || undefined,
                tags: dto.tags || [],
                publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
                status: dto.publishAt ? 'SCHEDULED' : 'DRAFT',
                accountId: dto.accountId,
            },
            include: {
                account: {
                    select: {
                        id: true,
                        platform: true,
                        nickname: true,
                    },
                },
            },
        });
        this.logger.log(`内容创建成功: ${post.id} (${post.status})`);
        return post;
    }
    async findAll(params) {
        const { userId, accountId, status, platform, skip = 0, take = 20 } = params;
        const where = {};
        if (accountId) {
            where.accountId = accountId;
        }
        else if (userId) {
            where.account = { userId };
        }
        if (status)
            where.status = status;
        if (platform)
            where.account = { ...where.account, platform: platform };
        const [posts, total] = await Promise.all([
            this.prisma.post.findMany({
                where,
                skip,
                take,
                include: {
                    account: {
                        select: {
                            id: true,
                            platform: true,
                            nickname: true,
                            avatar: true,
                        },
                    },
                    stats: true,
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.post.count({ where }),
        ]);
        return { posts, total, skip, take };
    }
    async findById(id, userId) {
        const post = await this.prisma.post.findUnique({
            where: { id },
            include: {
                account: {
                    select: {
                        id: true,
                        platform: true,
                        nickname: true,
                        avatar: true,
                        userId: true,
                        owner: {
                            select: { id: true, name: true },
                        },
                    },
                },
                stats: true,
            },
        });
        if (!post) {
            throw new common_1.NotFoundException('内容不存在');
        }
        if (userId && post.account.userId !== userId) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user || !['OWNER', 'ADMIN'].includes(user.role)) {
                throw new common_1.ForbiddenException('无权查看此内容');
            }
        }
        return post;
    }
    async update(id, data, userId) {
        const post = await this.prisma.post.findUnique({
            where: { id },
            include: { account: true },
        });
        if (!post) {
            throw new common_1.NotFoundException('内容不存在');
        }
        if (!['DRAFT', 'SCHEDULED'].includes(post.status)) {
            throw new common_1.BadRequestException('只有草稿和定时状态的内容可以修改');
        }
        if (post.account.userId !== userId) {
            throw new common_1.ForbiddenException('无权修改此内容');
        }
        const updateData = {};
        if (data.title !== undefined)
            updateData.title = data.title;
        if (data.content !== undefined)
            updateData.content = data.content;
        if (data.mediaUrls !== undefined)
            updateData.mediaUrls = data.mediaUrls;
        if (data.tags !== undefined)
            updateData.tags = data.tags;
        if (data.publishAt !== undefined) {
            updateData.publishAt = data.publishAt ? new Date(data.publishAt) : null;
            updateData.status = data.publishAt ? 'SCHEDULED' : 'DRAFT';
        }
        return this.prisma.post.update({
            where: { id },
            data: updateData,
            include: {
                account: {
                    select: { id: true, platform: true, nickname: true },
                },
            },
        });
    }
    async remove(id, userId) {
        const post = await this.prisma.post.findUnique({
            where: { id },
            include: { account: true },
        });
        if (!post) {
            throw new common_1.NotFoundException('内容不存在');
        }
        if (post.account.userId !== userId) {
            throw new common_1.ForbiddenException('无权删除此内容');
        }
        if (post.status === 'PUBLISHING') {
            throw new common_1.BadRequestException('发布中的内容无法删除');
        }
        await this.prisma.post.delete({ where: { id } });
        this.logger.log(`内容已删除: ${id}`);
        return { success: true };
    }
    async publish(contentId, userId) {
        const post = await this.prisma.post.findUnique({
            where: { id: contentId },
            include: { account: true },
        });
        if (!post) {
            throw new common_1.NotFoundException('内容不存在');
        }
        if (post.account.userId !== userId) {
            throw new common_1.ForbiddenException('无权发布此内容');
        }
        if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status)) {
            throw new common_1.BadRequestException(`当前状态 ${post.status} 不允许发布`);
        }
        const updated = await this.prisma.post.update({
            where: { id: contentId },
            data: { status: 'PUBLISHING' },
        });
        this.logger.log(`内容开始发布: ${contentId}`);
        return updated;
    }
    async updatePublishStatus(contentId, status, platformUrl, errorMsg) {
        return this.prisma.post.update({
            where: { id: contentId },
            data: {
                status,
                platformUrl: platformUrl || undefined,
                errorMsg: errorMsg || undefined,
            },
        });
    }
    async getScheduledPosts() {
        return this.prisma.post.findMany({
            where: {
                status: 'SCHEDULED',
                publishAt: { lte: new Date() },
            },
            include: {
                account: {
                    select: {
                        id: true,
                        platform: true,
                        nickname: true,
                        userId: true,
                    },
                },
            },
            orderBy: { publishAt: 'asc' },
        });
    }
    async claimForPublish(postId) {
        const result = await this.prisma.post.updateMany({
            where: { id: postId, status: 'SCHEDULED' },
            data: { status: 'PUBLISHING' },
        });
        return result.count > 0;
    }
    async batchPublish(dto, userId) {
        const { accountIds, ...contentData } = dto;
        if (!accountIds || accountIds.length === 0) {
            throw new common_1.BadRequestException('至少选择一个账号');
        }
        const accounts = await this.prisma.account.findMany({
            where: { id: { in: accountIds }, userId },
            select: { id: true, platform: true, nickname: true },
        });
        if (accounts.length !== accountIds.length) {
            throw new common_1.ForbiddenException('部分账号不属于当前用户');
        }
        const posts = await Promise.all(accounts.map((account) => this.prisma.post.create({
            data: {
                title: contentData.title,
                content: contentData.content,
                mediaUrls: contentData.mediaUrls || undefined,
                tags: contentData.tags || [],
                publishAt: contentData.publishAt ? new Date(contentData.publishAt) : null,
                status: contentData.publishAt ? 'SCHEDULED' : 'PUBLISHING',
                accountId: account.id,
            },
            include: {
                account: {
                    select: { id: true, platform: true, nickname: true },
                },
            },
        })));
        this.logger.log(`一键分发: ${posts.length} 条内容已创建 (用户: ${userId})`);
        const immediatePosts = posts.filter((p) => p.status === 'PUBLISHING');
        if (immediatePosts.length > 0) {
            this.executeImmediatePublish(immediatePosts).catch((err) => this.logger.error('立即发布执行异常', err.stack));
        }
        return { success: true, count: posts.length, posts };
    }
    async executeImmediatePublish(posts) {
        for (const post of posts) {
            try {
                const task = {
                    contentId: post.id,
                    accountId: post.accountId,
                    platform: post.account.platform,
                    title: post.title || '',
                    content: post.content || '',
                    mediaUrls: post.mediaUrls || [],
                    tags: post.tags || [],
                };
                await new Promise((r) => setTimeout(r, 3000 + Math.random() * 3000));
            }
            catch (error) {
                this.logger.error(`立即发布失败: ${post.id}`, error.message);
                await this.updatePublishStatus(post.id, 'FAILED', undefined, error.message);
            }
        }
    }
};
exports.ContentService = ContentService;
exports.ContentService = ContentService = ContentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ContentService);
//# sourceMappingURL=content.service.js.map