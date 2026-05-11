import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PublishScheduler } from './publish.scheduler';
import { DataSyncScheduler } from './data-sync.scheduler';
import { ContentModule } from '../content/content.module';
import { UploaderModule } from '../uploader/uploader.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    ContentModule,
    UploaderModule,
    NotificationsModule,
  ],
  providers: [PublishScheduler, DataSyncScheduler],
  exports: [PublishScheduler, DataSyncScheduler],
})
export class SchedulerModule {}
