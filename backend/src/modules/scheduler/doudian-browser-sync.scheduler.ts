import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { DoudianBrowserService } from '../doudian-browser/doudian-browser.service'

@Injectable()
export class DoudianBrowserSyncScheduler implements OnModuleInit {
  private readonly logger = new Logger(DoudianBrowserSyncScheduler.name)

  constructor(private readonly doudianBrowserService: DoudianBrowserService) {}

  onModuleInit() {
    setTimeout(() => {
      void this.runSync('startup')
    }, 20000)
  }

  @Cron('0 */30 * * * *')
  async handleThirtyMinuteSync() {
    await this.runSync('cron')
  }

  private async runSync(source: 'startup' | 'cron') {
    try {
      const result = await this.doudianBrowserService.syncAllStores()
      this.logger.log(`Doudian browser sync [${source}]: ${JSON.stringify(result)}`)
    } catch (error: any) {
      this.logger.error(`Doudian browser sync [${source}] failed: ${error.message}`, error.stack)
    }
  }
}
