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
var ContentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const ownership_helper_1 = require("../../common/utils/ownership.helper");
let ContentService = ContentService_1 = class ContentService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ContentService_1.name);
    }
    async create(dto, userId) {
        const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
        if (!account)
            throw new common_1.NotFoundException('账号不存在');
        return this.prisma.post.create({
            data: {
                title: dto.title,
                content: dto.content,
                mediaUrls: dto.mediaUrls ? JSON.stringify(dto.mediaUrls) : undefined,
                tags: dto.tags ? JSON.stringify(dto.tags) : '[]',
                publishAt: dto.publishAt ? new Date(dto.publishAt) : null,
                status: dto.publishAt ? 'SCHEDULED' : 'DRAFT',
                accountId: dto.accountId,
            },
            include: { account: { select: { id: true, platform: true, nickname: true } } },
        });
    }
    async findAll(params) {
        const { userId, accountId, status, platform, skip = 0, take = 20 } = params;
        const where = {};
        if (accountId)
            where.accountId = accountId;
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
                    account: { select: { id: true, platform: true, nickname: true, avatar: true } },
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
                    select: { id: true, platform: true, nickname: true, avatar: true, userId: true },
                },
                stats: true,
            },
        });
        if (!post)
            throw new common_1.NotFoundException('内容不存在');
        if (userId) {
            await ownership_helper_1.OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, post.account.userId, '内容');
        }
        return post;
    }
    async update(id, data, userId) {
        const post = await this.prisma.post.findUnique({ where: { id }, include: { account: true } });
        if (!post)
            throw new common_1.NotFoundException('内容不存在');
        if (!['DRAFT', 'SCHEDULED'].includes(post.status))
            throw new common_1.BadRequestException('仅草稿和定时内容可编辑');
        const updateData = {};
        if (data.title !== undefined)
            updateData.title = data.title;
        if (data.content !== undefined)
            updateData.content = data.content;
        if (data.mediaUrls !== undefined)
            updateData.mediaUrls = JSON.stringify(data.mediaUrls);
        if (data.tags !== undefined)
            updateData.tags = JSON.stringify(data.tags);
        if (data.publishAt !== undefined) {
            updateData.publishAt = data.publishAt ? new Date(data.publishAt) : null;
            updateData.status = data.publishAt ? 'SCHEDULED' : 'DRAFT';
        }
        return this.prisma.post.update({
            where: { id },
            data: updateData,
            include: { account: { select: { id: true, platform: true, nickname: true } } },
        });
    }
    async remove(id, userId) {
        const post = await this.prisma.post.findUnique({ where: { id }, include: { account: true } });
        if (!post)
            throw new common_1.NotFoundException('内容不存在');
        if (post.status === 'PUBLISHING')
            throw new common_1.BadRequestException('发布中的内容无法删除');
        await this.prisma.post.delete({ where: { id } });
        return { success: true };
    }
    async publish(contentId, userId) {
        const post = await this.prisma.post.findUnique({
            where: { id: contentId },
            include: { account: true },
        });
        if (!post)
            throw new common_1.NotFoundException('内容不存在');
        if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status))
            throw new common_1.BadRequestException(`当前状态 ${post.status} 不允许发布`);
        return this.prisma.post.update({ where: { id: contentId }, data: { status: 'PUBLISHING' } });
    }
    async updatePublishStatus(contentId, status, platformUrl, errorMsg) {
        return this.prisma.post.update({
            where: { id: contentId },
            data: { status, platformUrl: platformUrl || undefined, errorMsg: errorMsg || undefined },
        });
    }
    async getScheduledPosts() {
        return this.prisma.post.findMany({
            where: { status: 'SCHEDULED', publishAt: { lte: new Date() } },
            include: { account: { select: { id: true, platform: true, nickname: true, userId: true } } },
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
        if (!accountIds || accountIds.length === 0)
            throw new common_1.BadRequestException('请至少选择一个发布账号');
        const accounts = await this.prisma.account.findMany({
            where: { id: { in: accountIds } },
            select: { id: true, platform: true, nickname: true },
        });
        if (accounts.length !== accountIds.length)
            throw new common_1.ForbiddenException('部分发布账号不存在或无权操作');
        const posts = await Promise.all(accounts.map((account) => this.prisma.post.create({
            data: {
                title: contentData.title,
                content: contentData.content,
                mediaUrls: contentData.mediaUrls ? JSON.stringify(contentData.mediaUrls) : undefined,
                tags: contentData.tags ? JSON.stringify(contentData.tags) : '[]',
                publishAt: contentData.publishAt ? new Date(contentData.publishAt) : null,
                status: contentData.publishAt ? 'SCHEDULED' : 'PUBLISHING',
                accountId: account.id,
            },
            include: { account: { select: { id: true, platform: true, nickname: true } } },
        })));
        this.logger.log(`一键分发: ${posts.length} 条内容已创建 (用户: ${userId})`);
        return { success: true, count: posts.length, posts };
    }
};
exports.ContentService = ContentService;
exports.ContentService = ContentService = ContentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ContentService);
//# sourceMappingURL=content.service.js.map