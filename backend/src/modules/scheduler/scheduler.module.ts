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
import { OrderReportScheduler } from './order-report.scheduler'
import { RefundAlertScheduler } from './refund-alert.scheduler'
import { SchedulerController } from './scheduler.controller'

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
  controllers: [SchedulerController],
  providers: [
    PublishScheduler,
    DataSyncScheduler,
    WechatStoreSyncScheduler,
    DoudianBrowserSyncScheduler,
    OrderReportScheduler,
    RefundAlertScheduler,
  ],
  exports: [
    PublishScheduler,
    DataSyncScheduler,
    WechatStoreSyncScheduler,
    DoudianBrowserSyncScheduler,
    OrderReportScheduler,
    RefundAlertScheduler,
  ],
})
export class SchedulerModule {}
