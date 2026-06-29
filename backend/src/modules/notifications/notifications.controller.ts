import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { NotificationsService } from './notifications.service'

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'unreadOnly', required: false })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const pageNum = Math.max(1, Number(page) || 1)
    const limitNum = Math.min(50, Math.max(1, Number(limit) || 20))
    const skip = (pageNum - 1) * limitNum
    return this.notificationsService.findAll(userId, {
      skip,
      take: limitNum,
      unreadOnly: unreadOnly === 'true',
    })
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId)
  }

  @Post('feishu/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a Feishu notification test message' })
  async testFeishu(@CurrentUser('id') userId: string) {
    return this.notificationsService.sendFeishuTest(userId)
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.markAsRead(id, userId)
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a notification' })
  async remove(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.remove(id, userId)
  }

  @Delete('clear/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear read notifications' })
  async clearRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.clearRead(userId)
  }
}
