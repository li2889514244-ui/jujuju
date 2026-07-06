import { Module } from '@nestjs/common'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { FeishuOpenApiClient } from './feishu-open-api.client'
import { PrismaModule } from '../../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, FeishuOpenApiClient],
  exports: [NotificationsService],
})
export class NotificationsModule {}
