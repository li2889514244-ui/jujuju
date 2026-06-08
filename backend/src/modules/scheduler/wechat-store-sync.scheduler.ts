import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { WechatStoreService } from '../wechat-store/wechat-store.service'

@Injectable()
export class WechatStoreSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(WechatStoreSyncScheduler.name)

  constructor(private readonly wechatStoreService: WechatStoreService) {}

  onModuleInit() {
    setTimeout(() => {
      void this.runSync('startup')
    }, 10000)
  }

  @Cron('0 */5 * * * *')
  async handleFiveMinuteSync() {
    await this.runSync('cron')
  }

  private async runSync(source: 'startup' | 'cron') {
    try {
      const result = await this.wechatStoreService.syncAllStores()
      this.logger.log(`Wechat store sync [${source}]: ${JSON.stringify(result)}`)
    } catch (error: any) {
      this.logger.error(`Wechat store sync [${source}] failed: ${error.message}`, error.stack)
    }
  }
}
