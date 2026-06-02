import { Controller, Get, Param, Query, Post, Delete, Body } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { WechatStoreService } from './wechat-store.service'
@ApiTags('wechat-store')
@Controller('wechat-store')
export class WechatStoreController {
  constructor(private readonly wechatStoreService: WechatStoreService) {}
  @Get('stores') @Public() async getStores() { return this.wechatStoreService.getStores() }
  @Post('stores') @Public() async createStore(@Body() body: { name: string; appId: string; appSecret: string }) { return this.wechatStoreService.createStore(body.name, body.appId, body.appSecret) }
  @Delete('stores/:id') @Public() async deleteStore(@Param('id') id: string) { return this.wechatStoreService.deleteStore(id) }
  @Get('shop/orders') @Public() async getOrderList(@Query('store_id') storeId: string, @Query('page_size') page_size?: number) { return this.wechatStoreService.getOrderListAggregated(storeId, { page_size }) }
  @Get('shop/orders/:orderId') @Public() async getOrderDetail(@Query('store_id') storeId: string, @Param('orderId') orderId: string) { return this.wechatStoreService.getOrderDetail(storeId, orderId) }
  @Get('shop/products') @Public() async getProductList(@Query('store_id') storeId: string, @Query('page_size') page_size?: number) { return this.wechatStoreService.getProductListAggregated(storeId, { page_size }) }
  @Get('shop/aftersale') @Public() async getAftersaleList(@Query('store_id') storeId: string) { return this.wechatStoreService.getAftersaleList(storeId, {}) }
  @Get('shop/info') @Public() async getShopInfo(@Query('store_id') storeId: string) { return this.wechatStoreService.getShopInfo(storeId) }
}
