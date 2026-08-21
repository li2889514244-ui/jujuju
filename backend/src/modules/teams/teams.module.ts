import { Module } from '@nestjs/common'
import { TeamsController } from './teams.controller'
import { PermissionsController } from './permissions.controller'
import { TeamsService } from './teams.service'
import { PermissionService } from './permission.service'

@Module({
  controllers: [TeamsController, PermissionsController],
  providers: [TeamsService, PermissionService],
  exports: [TeamsService, PermissionService],
})
export class TeamsModule {}
