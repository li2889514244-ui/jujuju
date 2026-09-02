import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '../../common/prisma-enums'
import { CompanionMonitorService } from './companion-monitor.service'

@ApiTags('companion-monitor')
@ApiBearerAuth('access-token')
@Controller('companion-monitor')
export class CompanionMonitorController {
  constructor(private readonly monitorService: CompanionMonitorService) {}

  // 伴侣心跳上报：任何已登录用户（伴侣用 JWT 上报，不做角色限制）
  @Post('heartbeat')
  async heartbeat(@CurrentUser() user: any, @Body() payload: any) {
    if (!user || !user.id) throw new Error('未登录')
    return this.monitorService.processHeartbeat(user, payload || {})
  }

  @Get('devices')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async listDevices(@CurrentUser() user: any, @Query('filter') filter?: string) {
    return this.monitorService.listDevices(user, filter)
  }

  @Get('devices/:deviceId/history')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async getDeviceHistory(
    @CurrentUser() user: any,
    @Param('deviceId') deviceId: string,
    @Query('days') days?: string,
  ) {
    const daysNum = Number(days)
    return this.monitorService.getDeviceHistory(
      user,
      deviceId,
      Number.isFinite(daysNum) ? Math.min(30, Math.max(1, Math.floor(daysNum))) : 7,
    )
  }

  @Get('overview')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async getOverview(@CurrentUser() user: any) {
    return this.monitorService.getOverview(user)
  }

  @Get('alerts')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async listAlerts(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.monitorService.listAlerts(user, status === 'all' ? 'all' : 'open')
  }

  @Post('alerts/:id/acknowledge')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async acknowledgeAlert(@CurrentUser() user: any, @Param('id') id: string) {
    return this.monitorService.acknowledgeAlert(id, user)
  }

  // Phase 2: 故障（Incident）与事件（Event）查询
  @Get('incidents')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async listIncidents(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.monitorService.listIncidents(user, status || 'open')
  }

  @Get('events')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async listEvents(
    @CurrentUser() user: any,
    @Query('deviceId') deviceId?: string,
    @Query('take') take?: string,
  ) {
    return this.monitorService.listEvents(user, deviceId, Number(take) || 100)
  }
}
