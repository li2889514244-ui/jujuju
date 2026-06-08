import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { PublishScheduler } from './publish.scheduler'
import { DataSyncScheduler } from './data-sync.scheduler'
import { ContentModule } from '../content/content.module'
import { UploaderModule } from '../uploader/uploader.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { PrismaModule } from '../../prisma/prisma.module'
import { WechatStoreModule } from '../wechat-store/wechat-store.module'
import { WechatStoreSyncScheduler } from './wechat-store-sync.scheduler'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    ContentModule,
    UploaderModule,
    NotificationsModule,
    WechatStoreModule,
  ],
  providers: [PublishScheduler, DataSyncScheduler, WechatStoreSyncScheduler],
  exports: [PublishScheduler, DataSyncScheduler, WechatStoreSyncScheduler],
})
export class SchedulerModule {}
