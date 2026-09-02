import { Module } from '@nestjs/common'
import { PerformanceLadderController } from './performance-ladder.controller'
import { PerformanceLadderService } from './performance-ladder.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { TeamsModule } from '../teams/teams.module'

@Module({
  imports: [PrismaModule, TeamsModule],
  controllers: [PerformanceLadderController],
  providers: [PerformanceLadderService],
})
export class PerformanceLadderModule {}
