import { Controller, Get, Param, Query, Post, Delete, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { WechatStoreService } from './wechat-store.service'
@ApiTags('wechat-store')
@Controller('wechat-store')
export class WechatStoreController {
  constructor(private readonly wechatStoreService: WechatStoreService) {}

  private toOptionalNumber(value?: string) {
    if (value === undefined || value === '') return undefined
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  @Get('stores')
  async getStores() {
    return this.wechatStoreService.getStores()
  }

  @Post('stores')
  async createStore(@Body() body: { name: string; appId: string; appSecret: string }) {
    return this.wechatStoreService.createStore(body.name, body.appId, body.appSecret)
  }

  @Delete('stores/:id')
  async deleteStore(@Param('id') id: string) {
    return this.wechatStoreService.deleteStore(id)
  }

  @Get('shop/orders')
  async getOrderList(
    @Query('store_id') storeId: string,
    @Query('page_size') pageSize?: string,
    @Query('next_key') nextKey?: string,
    @Query('status') status?: string,
  ) {
    return this.wechatStoreService.getOrderListAggregated(storeId, {
      page_size: this.toOptionalNumber(pageSize),
      next_key: nextKey,
      status: this.toOptionalNumber(status),
    })
  }

  @Get('shop/orders/:orderId')
  async getOrderDetail(@Query('store_id') storeId: string, @Param('orderId') orderId: string) {
    return this.wechatStoreService.getOrderDetail(storeId, orderId)
  }

  @Get('shop/products')
  async getProductList(
    @Query('store_id') storeId: string,
    @Query('page_size') pageSize?: string,
    @Query('next_key') nextKey?: string,
  ) {
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
  ) {
    return this.wechatStoreService.getAftersaleListAggregated(storeId, {
      begin_create_time: this.toOptionalNumber(beginCreateTime),
      end_create_time: this.toOptionalNumber(endCreateTime),
      next_key: nextKey,
    })
  }

  @Get('shop/info')
  async getShopInfo(@Query('store_id') storeId: string) {
    return this.wechatStoreService.getShopInfo(storeId)
  }
}
