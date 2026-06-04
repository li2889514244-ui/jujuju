import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateContentDto } from './dto/create-content.dto'
import { PostStatus, Prisma } from '@prisma/client'
import { OwnershipHelper } from '../../common/utils/ownership.helper'

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name)

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateContentDto, userId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } })
    if (!account) throw new NotFoundException('账号不存在')
    // 共享模式：跳过所有权检查

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
    })
  }

  async findAll(params: {
    userId?: string
    accountId?: string
    status?: PostStatus
    platform?: string
    skip?: number
    take?: number
  }) {
    const { userId, accountId, status, platform, skip = 0, take = 20 } = params
    const where: Prisma.PostWhereInput = {}
    if (accountId) where.accountId = accountId
    // 共享模式：不按 userId 过滤
    if (status) where.status = status
    if (platform) where.account = { ...(where.account as any), platform: platform as any }

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
    ])
    return { posts, total, skip, take }
  }

  async findById(id: string, userId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        account: {
          select: { id: true, platform: true, nickname: true, avatar: true, userId: true },
        },
        stats: true,
      },
    })
    if (!post) throw new NotFoundException('内容不存在')
    if (userId) {
      await OwnershipHelper.assertOwnershipOrAdmin(this.prisma, userId, post.account.userId, '内容')
    }
    return post
  }

  async update(id: string, data: Partial<CreateContentDto>, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id }, include: { account: true } })
    if (!post) throw new NotFoundException('内容不存在')
    if (!['DRAFT', 'SCHEDULED'].includes(post.status))
      throw new BadRequestException('仅草稿和定时内容可编辑')
    // 共享模式：跳过所有权检查

    const updateData: Prisma.PostUpdateInput = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.content !== undefined) updateData.content = data.content
    if (data.mediaUrls !== undefined) updateData.mediaUrls = JSON.stringify(data.mediaUrls)
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags)
    if (data.publishAt !== undefined) {
      updateData.publishAt = data.publishAt ? new Date(data.publishAt) : null
      updateData.status = data.publishAt ? 'SCHEDULED' : 'DRAFT'
    }

    return this.prisma.post.update({
      where: { id },
      data: updateData,
      include: { account: { select: { id: true, platform: true, nickname: true } } },
    })
  }

  async remove(id: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id }, include: { account: true } })
    if (!post) throw new NotFoundException('内容不存在')
    // 共享模式：跳过所有权检查
    if (post.status === 'PUBLISHING') throw new BadRequestException('发布中的内容无法删除')
    await this.prisma.post.delete({ where: { id } })
    return { success: true }
  }

  async publish(contentId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: contentId },
      include: { account: true },
    })
    if (!post) throw new NotFoundException('内容不存在')
    // 共享模式：跳过所有权检查
    if (!['DRAFT', 'SCHEDULED', 'FAILED'].includes(post.status))
      throw new BadRequestException(`当前状态 ${post.status} 不允许发布`)

    return this.prisma.post.update({ where: { id: contentId }, data: { status: 'PUBLISHING' } })
  }

  async updatePublishStatus(
    contentId: string,
    status: PostStatus,
    platformUrl?: string,
    errorMsg?: string,
  ) {
    return this.prisma.post.update({
      where: { id: contentId },
      data: { status, platformUrl: platformUrl || undefined, errorMsg: errorMsg || undefined },
    })
  }

  async getScheduledPosts() {
    return this.prisma.post.findMany({
      where: { status: 'SCHEDULED', publishAt: { lte: new Date() } },
      include: { account: { select: { id: true, platform: true, nickname: true, userId: true } } },
      orderBy: { publishAt: 'asc' },
    })
  }

  async claimForPublish(postId: string): Promise<boolean> {
    const result = await this.prisma.post.updateMany({
      where: { id: postId, status: 'SCHEDULED' },
      data: { status: 'PUBLISHING' },
    })
    return result.count > 0
  }

  async batchPublish(
    dto: {
      title: string
      content: string
      mediaUrls?: string[]
      tags?: string[]
      accountIds: string[]
      publishAt?: string
    },
    userId: string,
  ) {
    const { accountIds, ...contentData } = dto
    if (!accountIds || accountIds.length === 0)
      throw new BadRequestException('请至少选择一个发布账号')

    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: { id: true, platform: true, nickname: true },
    })
    if (accounts.length !== accountIds.length)
      throw new ForbiddenException('部分发布账号不存在或无权操作')

    const posts = await Promise.all(
      accounts.map((account) =>
        this.prisma.post.create({
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
        }),
      ),
    )

    this.logger.log(`一键分发: ${posts.length} 条内容已创建 (用户: ${userId})`)
    // Uploader module disabled — posts need external uploader agent
    return { success: true, count: posts.length, posts }
  }
}
