import { Controller, Get, Param, Query, Post, Delete, Body } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { WechatStoreService } from './wechat-store.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'

@ApiTags('wechat-store')
@ApiBearerAuth('access-token')
@Controller('wechat-store')
export class WechatStoreController {
  constructor(private readonly wechatStoreService: WechatStoreService) {}

  private toOptionalNumber(value?: string) {
    if (value === undefined || value === '') return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  @Get('stores')
  async getStores(@CurrentUser() user: any) {
    return this.wechatStoreService.getStores(user)
  }

  @Post('stores')
  async createStore(@Body() body: { name: string; appId: string; appSecret: string }, @CurrentUser() user: any) {
    return this.wechatStoreService.createStore(body.name, body.appId, body.appSecret, user)
  }

  @Delete('stores/:id')
  async deleteStore(@Param('id') id: string, @CurrentUser() user: any) {
    return this.wechatStoreService.deleteStore(id, user)
  }

  @Post('stores/:id/sync')
  async syncStore(@Param('id') id: string, @CurrentUser() user: any) {
    await this.wechatStoreService.syncStore(id, user)
    return { success: true }
  }

  @Post('sync')
  async syncAllStores() {
    return this.wechatStoreService.syncAllStores()
  }

  @Get('shop/orders')
  async getOrderList(
    @Query('store_id') storeId: string,
    @Query('page_size') pageSize?: string,
    @Query('next_key') nextKey?: string,
    @Query('status') status?: string,
    @Query('start_time') startTime?: string,
    @Query('end_time') endTime?: string,
    @CurrentUser() user?: any,
  ) {
    await this.wechatStoreService.assertStoreAccess(storeId, user)
    return this.wechatStoreService.getOrderListAggregated(storeId, {
      page_size: this.toOptionalNumber(pageSize),
      next_key: nextKey,
      status: this.toOptionalNumber(status),
      start_time: this.toOptionalNumber(startTime),
      end_time: this.toOptionalNumber(endTime),
    })
  }

  @Get('shop/orders/:orderId')
  async getOrderDetail(@Query('store_id') storeId: string, @Param('orderId') orderId: string, @CurrentUser() user: any) {
    await this.wechatStoreService.assertStoreAccess(storeId, user)
    return this.wechatStoreService.getOrderDetail(storeId, orderId)
  }

  @Get('shop/products')
  async getProductList(
    @Query('store_id') storeId: string,
    @Query('page_size') pageSize?: string,
    @Query('next_key') nextKey?: string,
    @CurrentUser() user?: any,
  ) {
    await this.wechatStoreService.assertStoreAccess(storeId, user)
    return this.wechatStoreService.getProductListAggregated(storeId, {
      page_size: this.toOptionalNumber(pageSize),
      next_key: nextKey,
    })
  }

  @Get('shop/aftersale')
  async getAftersaleList(
    @Query('store_id') storeId: string,
    @Query('begin_create_time') beginCreateTime?: string,
    @Query('end_create_time') endCreateTime?: string,
    @Query('next_key') nextKey?: string,
    @CurrentUser() user?: any,
  ) {
    await this.wechatStoreService.assertStoreAccess(storeId, user)
    return this.wechatStoreService.getAftersaleListAggregated(storeId, {
      begin_create_time: this.toOptionalNumber(beginCreateTime),
      end_create_time: this.toOptionalNumber(endCreateTime),
      next_key: nextKey,
    })
  }

  @Get('shop/info')
  async getShopInfo(@Query('store_id') storeId: string, @CurrentUser() user: any) {
    await this.wechatStoreService.assertStoreAccess(storeId, user)
    return this.wechatStoreService.getShopInfo(storeId)
  }
}
