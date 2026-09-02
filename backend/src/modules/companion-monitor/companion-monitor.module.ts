import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { CompanionMonitorController } from './companion-monitor.controller'
import { CompanionMonitorService } from './companion-monitor.service'

@Module({
  imports: [PrismaModule],
  controllers: [CompanionMonitorController],
  providers: [CompanionMonitorService],
  exports: [CompanionMonitorService],
})
export class CompanionMonitorModule {}
