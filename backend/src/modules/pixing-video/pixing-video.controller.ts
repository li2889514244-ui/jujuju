import { Controller, Get, Post, Patch, Param, Query, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PixingVideoService } from './pixing-video.service';
import { CreateTaskDto, UpdateTaskDto } from './dto/create-task.dto';

@ApiTags('pixing-video')
@ApiBearerAuth()
@Controller('pixing-video')
export class PixingVideoController {
  constructor(private readonly service: PixingVideoService) {}

  @Post('tasks')
  @ApiOperation({ summary: '创建视频生成任务' })
  createTask(@CurrentUser('id') userId: string, @Body() dto: CreateTaskDto) {
    return this.service.createTask(userId, dto);
  }

  @Get('tasks')
  @ApiOperation({ summary: '获取我的任务列表' })
  listTasks(
    @CurrentUser('id') userId: string,
    @Query('status') status?: string,
  ) {
    return this.service.listTasks(userId, status);
  }

  @Get('tasks/next')
  @Public()
  @ApiOperation({ summary: '[本地服务] 获取下一个待处理任务' })
  getNextTask() {
    return this.service.getNextPendingTask();
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: '获取任务详情' })
  getTask(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.service.getTask(id, userId);
  }

  @Patch('tasks/:id')
  @Public()
  @ApiOperation({ summary: '[本地服务] 更新任务状态' })
  updateTask(@Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.service.updateTask(id, dto);
  }
}
