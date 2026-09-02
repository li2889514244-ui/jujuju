import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { DoudianBrowserService } from './doudian-browser.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('doudian-browser')
@Controller('doudian-browser')
export class DoudianBrowserController {
  constructor(private readonly doudianBrowserService: DoudianBrowserService) {}

  private toOptionalNumber(value?: string) {
    if (value === undefined || value === '') return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  private toRequiredPositiveNumber(value: string, field: string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive number`)
    }
    return parsed
  }

  @Get('stores')
  getStores(@CurrentUser() user: any) {
    return this.doudianBrowserService.getStores(user)
  }

  @Post('stores')
  createStore(@Body() body: { name: string; profilePath?: string }, @CurrentUser() user: any) {
    return this.doudianBrowserService.createStore(body.name, body.profilePath, user)
  }

  @Post('stores/companion')
  createCompanionStore(@Body() body: { name: string; localProfileId?: string }, @CurrentUser() user: any) {
    return this.doudianBrowserService.createCompanionStore(body.name, body.localProfileId, user)
  }

  @Delete('stores/:id')
  deleteStore(@Param('id') id: string, @CurrentUser() user: any) {
    return this.doudianBrowserService.deleteStore(id, user)
  }

  @Patch('stores/:id')
  async updateStore(
    @Param('id') id: string,
    @Body() body: { name?: string },
    @CurrentUser() user: any,
  ) {
    const result = await this.doudianBrowserService.updateStoreName(id, body.name, user)
    return { success: true, ...result }
  }

  @Post('stores/:id/sync')
  async syncStore(@Param('id') id: string, @CurrentUser() user: any) {
    const result = await this.doudianBrowserService.syncStore(id, user)
    return { success: true, ...result }
  }

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
      partial?: boolean
    },
    @CurrentUser() user: any,
  ) {
    await this.doudianBrowserService.assertStoreAccess(id, user)
    const result = await this.doudianBrowserService.uploadCompanionData(id, body)
    return { success: true, ...result }
  }

  @Post('stores/:id/rebind')
  async rebindCompanionStore(
    @Param('id') id: string,
    @Body() body: { localProfileId?: string; storeName?: string },
    @CurrentUser() user: any,
  ) {
    return this.doudianBrowserService.rebindCompanionStore(id, body, user)
  }

  @Post('sync')
  syncAllStores() {
    return this.doudianBrowserService.syncAllStores()
  }

  @Post('stores/:id/login')
  async openLogin(@Param('id') id: string, @CurrentUser() user: any) {
    await this.doudianBrowserService.assertStoreAccess(id, user)
    await this.doudianBrowserService.openLoginWindow(id)
    return { success: true }
  }

  @Get('stores/:id/session')
  async checkSession(@Param('id') id: string, @CurrentUser() user: any) {
    await this.doudianBrowserService.assertStoreAccess(id, user)
    return this.doudianBrowserService.checkSession(id)
  }

  @Get('shop/orders')
  async getOrders(
    @Query('store_id') storeId: string,
    @Query('start_time') startTime?: string,
    @Query('end_time') endTime?: string,
    @CurrentUser() user?: any,
  ) {
    await this.doudianBrowserService.assertStoreAccess(storeId, user)
    return this.doudianBrowserService.getOrders(storeId, {
      start_time: this.toOptionalNumber(startTime),
      end_time: this.toOptionalNumber(endTime),
    })
  }

  @Get('shop/products')
  async getProducts(@Query('store_id') storeId: string, @CurrentUser() user: any) {
    await this.doudianBrowserService.assertStoreAccess(storeId, user)
    return this.doudianBrowserService.getProducts(storeId)
  }

  @Get('shop/aftersale')
  async getAftersales(
    @Query('store_id') storeId: string,
    @Query('begin_create_time') beginCreateTime?: string,
    @Query('end_create_time') endCreateTime?: string,
    @CurrentUser() user?: any,
  ) {
    await this.doudianBrowserService.assertStoreAccess(storeId, user)
    return this.doudianBrowserService.getAftersales(storeId, {
      begin_create_time: this.toOptionalNumber(beginCreateTime),
      end_create_time: this.toOptionalNumber(endCreateTime),
    })
  }

  @Get('shop/summary')
  async getSummary(
    @Query('store_id') storeId: string,
    @Query('start') start: string,
    @Query('end') end: string,
    @Query('mode') mode: 'today' | 'yesterday' | 'week' | 'month',
    @CurrentUser() user?: any,
  ) {
    await this.doudianBrowserService.assertStoreAccess(storeId, user)
    const startValue = this.toRequiredPositiveNumber(start, 'start')
    const endValue = this.toRequiredPositiveNumber(end, 'end')
    if (endValue < startValue) {
      throw new BadRequestException('end must be greater than or equal to start')
    }
    return this.doudianBrowserService.getSummary(storeId, startValue, endValue, mode)
  }
}
