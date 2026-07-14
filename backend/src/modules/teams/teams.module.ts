import { Module } from '@nestjs/common'
import { TeamsController } from './teams.controller'
import { PermissionsController } from './permissions.controller'
import { TeamsService } from './teams.service'

@Module({
  controllers: [TeamsController, PermissionsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}
