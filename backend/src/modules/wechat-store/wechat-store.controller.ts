import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { WechatStoreService } from './wechat-store.service'

@ApiTags('wechat-store')
@Controller('wechat-store')
@ApiBearerAuth('access-token')
export class WechatStoreController {
  constructor(private readonly wechatStoreService: WechatStoreService) {}

  @Get('orders')
  @ApiOperation({ summary: '获取佣金单列表' })
  async getOrderList(
    @Query('page_size') page_size?: number,
    @Query('next_key') next_key?: string,
    @Query('order_id') order_id?: string,
  ) {
    return this.wechatStoreService.getOrderList({ page_size, next_key, order_id })
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: '获取佣金单详情' })
  async getOrderDetail(
    @Param('orderId') orderId: string,
    @Query('sku_id') skuId: string,
    @Query('special_id') specialId?: string,
  ) {
    return this.wechatStoreService.getOrderDetail(orderId, skuId, specialId)
  }

  @Get('products')
  @ApiOperation({ summary: '获取橱窗商品列表' })
  async getProductList(
    @Query('page_size') page_size?: number,
    @Query('page_index') page_index?: number,
    @Query('last_buffer') last_buffer?: string,
  ) {
    return this.wechatStoreService.getProductList({ page_size, page_index, last_buffer })
  }

  @Get('products/:productId')
  @ApiOperation({ summary: '获取橱窗商品详情' })
  async getProductDetail(@Param('productId') productId: string) {
    return this.wechatStoreService.getProductDetail(productId)
  }
}
