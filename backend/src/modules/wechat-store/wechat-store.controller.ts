import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { WechatStoreService } from './wechat-store.service'

@ApiTags('wechat-store')
@Controller('wechat-store')
export class WechatStoreController {
  constructor(private readonly wechatStoreService: WechatStoreService) {}

  // ======= 带货助手（达人） =======

  @Get('orders')
  @Public()
  @ApiOperation({ summary: '获取佣金单列表（带货助手）' })
  async getOrderList(
    @Query('page_size') page_size?: number,
    @Query('next_key') next_key?: string,
    @Query('order_id') order_id?: string,
  ) {
    return this.wechatStoreService.getOrderList({ page_size, next_key, order_id })
  }

  @Get('orders/:orderId')
  @Public()
  @ApiOperation({ summary: '获取佣金单详情（带货助手）' })
  async getOrderDetail(
    @Param('orderId') orderId: string,
    @Query('sku_id') skuId: string,
    @Query('special_id') specialId?: string,
  ) {
    return this.wechatStoreService.getOrderDetail(orderId, skuId, specialId)
  }

  @Get('products')
  @Public()
  @ApiOperation({ summary: '获取橱窗商品列表（带货助手）' })
  async getProductList(
    @Query('page_size') page_size?: number,
    @Query('page_index') page_index?: number,
    @Query('last_buffer') last_buffer?: string,
  ) {
    return this.wechatStoreService.getProductList({ page_size, page_index, last_buffer })
  }

  @Get('products/:productId')
  @Public()
  @ApiOperation({ summary: '获取橱窗商品详情（带货助手）' })
  async getProductDetail(@Param('productId') productId: string) {
    return this.wechatStoreService.getProductDetail(productId)
  }

  // ======= 唐商披星（小店商家） =======

  @Get('shop/orders')
  @Public()
  @ApiOperation({ summary: '获取小店订单列表（唐商披星）' })
  async getShopOrderList(
    @Query('page_size') page_size?: number,
    @Query('next_key') next_key?: string,
    @Query('status') status?: number,
  ) {
    return this.wechatStoreService.getShopOrderList({ page_size, next_key, status })
  }

  @Get('shop/orders/:orderId')
  @Public()
  @ApiOperation({ summary: '获取小店订单详情（唐商披星）' })
  async getShopOrderDetail(@Param('orderId') orderId: string) {
    return this.wechatStoreService.getShopOrderDetail(orderId)
  }

  @Get('shop/products')
  @Public()
  @ApiOperation({ summary: '获取小店商品列表（唐商披星）' })
  async getShopProductList(
    @Query('page_size') page_size?: number,
    @Query('next_key') next_key?: string,
  ) {
    return this.wechatStoreService.getShopProductList({ page_size, next_key })
  }
}
