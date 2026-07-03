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
import { DoudianBrowserModule } from '../doudian-browser/doudian-browser.module'
import { DoudianBrowserSyncScheduler } from './doudian-browser-sync.scheduler'

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    ContentModule,
    UploaderModule,
    NotificationsModule,
    WechatStoreModule,
    DoudianBrowserModule,
  ],
  providers: [
    PublishScheduler,
    DataSyncScheduler,
    WechatStoreSyncScheduler,
    DoudianBrowserSyncScheduler,
  ],
  exports: [
    PublishScheduler,
    DataSyncScheduler,
    WechatStoreSyncScheduler,
    DoudianBrowserSyncScheduler,
  ],
})
export class SchedulerModule {}
