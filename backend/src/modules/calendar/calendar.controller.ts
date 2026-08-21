import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CalendarService } from './calendar.service';

@ApiTags('calendar')
@Controller('calendar')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('events')
  @ApiOperation({ summary: '获取用户事件列表' })
  async findAll(
    @CurrentUser('id') userId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.calendarService.findAll(userId, {
      startDate,
      endDate,
      teamId,
    });
  }

  @Post('events')
  @ApiOperation({ summary: '创建事件' })
  async create(
    @CurrentUser('id') userId: string,
    @Body()
    dto: {
      title: string;
      description?: string;
      eventType?: string;
      startTime: string;
      endTime: string;
      color?: string;
      allDay?: boolean;
      location?: string;
      teamId?: string;
    },
  ) {
    return this.calendarService.create(userId, dto);
  }

  @Put('events/:id')
  @ApiOperation({ summary: '更新事件' })
  async update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body()
    dto: {
      title?: string;
      description?: string;
      eventType?: string;
      startTime?: string;
      endTime?: string;
      color?: string;
      allDay?: boolean;
      location?: string;
      teamId?: string;
    },
  ) {
    return this.calendarService.update(id, userId, dto);
  }

  @Delete('events/:id')
  @ApiOperation({ summary: '删除事件' })
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.calendarService.remove(id, userId);
  }
}
