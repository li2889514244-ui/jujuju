import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ContentService } from './content.service';
import { CreateContentDto } from './dto/create-content.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PostStatus } from '@prisma/client';

@ApiTags('content')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('content')
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post()
  @ApiOperation({ summary: '创建内容' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(
    @Body() dto: CreateContentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.contentService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '获取内容列表' })
  @ApiQuery({ name: 'accountId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: PostStatus })
  @ApiQuery({ name: 'page', required: false, description: '页码（从1开始）' })
  @ApiQuery({ name: 'limit', required: false, description: '每页条数（最大100）' })
  async findAll(
    @Query('accountId') accountId?: string,
    @Query('status') status?: PostStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser('id') userId?: string,
  ) {
    const pageNum = Math.max(1, page || 1);
    const limitNum = Math.min(100, Math.max(1, limit || 20));
    const skip = (pageNum - 1) * limitNum;
    return this.contentService.findAll({ userId, accountId, status, skip, take: limitNum });
  }

  @Get('scheduled')
  @ApiOperation({ summary: '获取待发布队列' })
  async getScheduled() {
    return this.contentService.getScheduledPosts();
  }

  @Get(':id')
  @ApiOperation({ summary: '获取内容详情' })
  @ApiResponse({ status: 404, description: '内容不存在' })
  async findOne(@Param('id') id: string) {
    return this.contentService.findById(id);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新内容' })
  @ApiResponse({ status: 400, description: '非草稿/定时状态不可修改' })
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateContentDto>,
    @CurrentUser('id') userId: string,
  ) {
    return this.contentService.update(id, dto, userId);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发布内容' })
  @ApiResponse({ status: 400, description: '当前状态不允许发布' })
  async publish(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contentService.publish(id, userId);
  }

  @Post('batch-publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '一键分发：同一内容发布到多个账号' })
  async batchPublish(
    @CurrentUser('id') userId: string,
    @Body() dto: {
      title: string;
      content: string;
      mediaUrls?: string[];
      tags?: string[];
      accountIds: string[];
      publishAt?: string;
    },
  ) {
    return this.contentService.batchPublish(dto, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除内容' })
  @ApiResponse({ status: 400, description: '发布中的内容无法删除' })
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.contentService.remove(id, userId);
  }
}
