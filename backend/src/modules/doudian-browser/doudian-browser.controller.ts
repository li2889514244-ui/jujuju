import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { DoudianBrowserService } from './doudian-browser.service'

@ApiTags('doudian-browser')
@Controller('doudian-browser')
export class DoudianBrowserController {
  constructor(private readonly doudianBrowserService: DoudianBrowserService) {}

  private toOptionalNumber(value?: string) {
    if (value === undefined || value === '') return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  @Public()
  @Get('stores')
  getStores() {
    return this.doudianBrowserService.getStores()
  }

  @Post('stores')
  createStore(@Body() body: { name: string; profilePath?: string }) {
    return this.doudianBrowserService.createStore(body.name, body.profilePath)
  }

  @Post('stores/companion')
  createCompanionStore(@Body() body: { name: string; localProfileId?: string }) {
    return this.doudianBrowserService.createCompanionStore(body.name, body.localProfileId)
  }

  @Delete('stores/:id')
  deleteStore(@Param('id') id: string) {
    return this.doudianBrowserService.deleteStore(id)
  }

  @Post('stores/:id/sync')
  async syncStore(@Param('id') id: string) {
    const result = await this.doudianBrowserService.syncStore(id)
    return { success: true, ...result }
  }

  @Public()
  @Post('stores/:id/upload')
  async uploadCompanionData(
    @Param('id') id: string,
    @Body()
    body: {
      storeName?: string
      localProfileId?: string
      orders?: any
      products?: any
      aftersales?: any
    },
  ) {
    const result = await this.doudianBrowserService.uploadCompanionData(id, body)
    return { success: true, ...result }
  }

  @Post('sync')
  syncAllStores() {
    return this.doudianBrowserService.syncAllStores()
  }

  @Post('stores/:id/login')
  async openLogin(@Param('id') id: string) {
    await this.doudianBrowserService.openLoginWindow(id)
    return { success: true }
  }

  @Get('stores/:id/session')
  checkSession(@Param('id') id: string) {
    return this.doudianBrowserService.checkSession(id)
  }

  @Public()
  @Get('shop/orders')
  getOrders(
    @Query('store_id') storeId: string,
    @Query('start_time') startTime?: string,
    @Query('end_time') endTime?: string,
  ) {
    return this.doudianBrowserService.getOrders(storeId, {
      start_time: this.toOptionalNumber(startTime),
      end_time: this.toOptionalNumber(endTime),
    })
  }

  @Public()
  @Get('shop/products')
  getProducts(@Query('store_id') storeId: string) {
    return this.doudianBrowserService.getProducts(storeId)
  }

  @Public()
  @Get('shop/aftersale')
  getAftersales(
    @Query('store_id') storeId: string,
    @Query('begin_create_time') beginCreateTime?: string,
    @Query('end_create_time') endCreateTime?: string,
  ) {
    return this.doudianBrowserService.getAftersales(storeId, {
      begin_create_time: this.toOptionalNumber(beginCreateTime),
      end_create_time: this.toOptionalNumber(endCreateTime),
    })
  }

  @Public()
  @Get('shop/summary')
  getSummary(
    @Query('store_id') storeId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('mode') mode: 'today' | 'yesterday' | 'week' | 'month',
  ) {
    return this.doudianBrowserService.getSummary(storeId, Number(start), Number(end), mode)
  }
}
