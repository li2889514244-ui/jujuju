import { Module } from '@nestjs/common'
import { WechatStoreController } from './wechat-store.controller'
import { WechatStoreService } from './wechat-store.service'

@Module({
  controllers: [WechatStoreController],
  providers: [WechatStoreService],
  exports: [WechatStoreService],
})
export class WechatStoreModule {}
