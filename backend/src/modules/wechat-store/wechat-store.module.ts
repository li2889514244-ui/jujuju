import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { WechatStoreController } from './wechat-store.controller'
import { WechatStoreService } from './wechat-store.service'

@Module({
  imports: [PrismaModule],
  controllers: [WechatStoreController],
  providers: [WechatStoreService],
  exports: [WechatStoreService],
})
export class WechatStoreModule {}
