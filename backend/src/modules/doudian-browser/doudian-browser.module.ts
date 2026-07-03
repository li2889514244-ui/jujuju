import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { DoudianBrowserController } from './doudian-browser.controller'
import { DoudianBrowserService } from './doudian-browser.service'

@Module({
  imports: [PrismaModule],
  controllers: [DoudianBrowserController],
  providers: [DoudianBrowserService],
  exports: [DoudianBrowserService],
})
export class DoudianBrowserModule {}
