import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { CompanionMonitorModule } from '../companion-monitor/companion-monitor.module'
import { SystemHealthController } from './system-health.controller'
import { SystemHealthService } from './system-health.service'

@Module({
  imports: [PrismaModule, CompanionMonitorModule],
  controllers: [SystemHealthController],
  providers: [SystemHealthService],
  exports: [SystemHealthService],
})
export class SystemHealthModule {}
