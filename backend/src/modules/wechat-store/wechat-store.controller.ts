import { Controller, Get, Param, Query, Post, Delete, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { WechatStoreService } from './wechat-store.service'

@ApiTags('wechat-store')
@Controller('wechat-store')
export class WechatStoreController {
  constructor(private readonly wechatStoreService: WechatStoreService) {}

  // ── 店铺管理 ──

  @Get('stores')
  @Public()
  @ApiOperation({ summary: '获取所有微信小店列表' })
  async getStores() {
    return this.wechatStoreService.getStores()
  }

  @Post('stores')
  @Public()
  @ApiOperation({ summary: '添加微信小店' })
  async createStore(@Body() body: { name: string; appId: string; appSecret: string }) {
    return this.wechatStoreService.createStore(body.name, body.appId, body.appSecret)
  }

  @Delete('stores/:id')
  @Public()
  @ApiOperation({ summary: '删除微信小店' })
  async deleteStore(@Param('id') id: string) {
    return this.wechatStoreService.deleteStore(id)
  }

  // ── 订单 ──

  @Get('shop/orders')
  @Public()
  @ApiOperation({ summary: '获取小店订单列表' })
  async getOrderList(
    @Query('store_id') storeId: string,
    @Query('page_size') page_size?: number,
    @Query('next_key') next_key?: string,
    @Query('status') status?: number,
  ) {
    return this.wechatStoreService.getOrderList(storeId, { page_size, next_key, status })
  }

  @Get('shop/orders/:orderId')
  @Public()
  @ApiOperation({ summary: '获取小店订单详情' })
  async getOrderDetail(@Query('store_id') storeId: string, @Param('orderId') orderId: string) {
    return this.wechatStoreService.getOrderDetail(storeId, orderId)
  }

  // ── 商品 ──

  @Get('shop/products')
  @Public()
  @ApiOperation({ summary: '获取小店商品列表' })
  async getProductList(
    @Query('store_id') storeId: string,
    @Query('page_size') page_size?: number,
    @Query('next_key') next_key?: string,
  ) {
    return this.wechatStoreService.getProductList(storeId, { page_size, next_key })
  }
}
