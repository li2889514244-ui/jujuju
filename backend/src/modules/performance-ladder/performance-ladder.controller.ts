import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { PerformanceLadderService } from './performance-ladder.service'
import { UpdatePerformanceLadderConfigDto } from './dto/update-performance-ladder-config.dto'
import { CreatePerformanceLadderTeacherDto } from './dto/create-performance-ladder-teacher.dto'
import { UpdatePerformanceLadderTeacherDto } from './dto/update-performance-ladder-teacher.dto'
import { InitializePerformanceLadderDto } from './dto/initialize-performance-ladder.dto'

@ApiTags('performance-ladder')
@Controller('performance-ladder')
export class PerformanceLadderController {
  constructor(private readonly service: PerformanceLadderService) {}

  @Get('config')
  @ApiOperation({ summary: '获取组织业绩天梯配置' })
  getConfig(@CurrentUser('id') userId: string) {
    return this.service.getConfig(userId)
  }

  @Get('month-snapshot/:month')
  @ApiOperation({ summary: '获取某自然月当时生效的目标与归因规则快照' })
  getMonthSnapshot(@CurrentUser('id') userId: string, @Param('month') month: string) {
    return this.service.getMonthSnapshot(userId, month)
  }

  @Put('config')
  @ApiOperation({ summary: '更新组织业绩天梯配置' })
  updateConfig(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePerformanceLadderConfigDto,
  ) {
    return this.service.updateConfig(userId, dto)
  }

  @Post('config/initialize')
  @ApiOperation({ summary: '首次初始化组织业绩天梯配置' })
  initializeConfig(
    @CurrentUser('id') userId: string,
    @Body() dto: InitializePerformanceLadderDto,
  ) {
    return this.service.initializeConfig(userId, dto)
  }

  @Get('teachers')
  @ApiOperation({ summary: '获取组织业绩天梯老师配置' })
  getTeachers(@CurrentUser('id') userId: string) {
    return this.service.getTeachers(userId)
  }

  @Post('teachers')
  @ApiOperation({ summary: '新增业绩天梯老师' })
  createTeacher(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePerformanceLadderTeacherDto,
  ) {
    return this.service.createTeacher(userId, dto)
  }

  @Patch('teachers/:id')
  @ApiOperation({ summary: '更新业绩天梯老师' })
  updateTeacher(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePerformanceLadderTeacherDto,
  ) {
    return this.service.updateTeacher(userId, id, dto)
  }

  @Delete('teachers/:id')
  @ApiOperation({ summary: '删除业绩天梯老师' })
  deleteTeacher(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.service.deleteTeacher(userId, id)
  }
}
