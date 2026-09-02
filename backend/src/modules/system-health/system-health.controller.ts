import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Roles } from '../../common/decorators/roles.decorator'
import { Role } from '../../common/prisma-enums'
import { SystemHealthService } from './system-health.service'

@ApiTags('system-health')
@ApiBearerAuth('access-token')
@Controller('system-health')
export class SystemHealthController {
  constructor(private readonly systemHealthService: SystemHealthService) {}

  @Get('overview')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async getOverview(@CurrentUser() user: any) {
    return this.systemHealthService.getOverview(user)
  }

  @Get('incidents')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async listIncidents(@CurrentUser() user: any, @Query() query: Record<string, unknown>) {
    return this.systemHealthService.listIncidents(user, query || {})
  }

  @Post('incidents/:id/acknowledge')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async acknowledgeIncident(@CurrentUser() user: any, @Param('id') id: string) {
    return this.systemHealthService.acknowledgeIncident(user, id)
  }

  @Get('events')
  @Roles(Role.SUPER_ADMIN, Role.OWNER, Role.ADMIN)
  async listEvents(@CurrentUser() user: any, @Query() query: Record<string, unknown>) {
    return this.systemHealthService.listEvents(user, query || {})
  }

  @Post('frontend-events')
  async reportFrontendEvent(@CurrentUser() user: any, @Body() payload: Record<string, unknown>) {
    return this.systemHealthService.recordFrontendEvent(user, payload || {})
  }
}
