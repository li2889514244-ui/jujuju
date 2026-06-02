/**
 * 微信小店带货助手 API
 * 数据来源: 后端 wechat-store 模块（@Public 端点）
 */
import { get } from './request'

export interface WechatOrder {
  /** 订单ID */
  order_id: string
  /** 商品ID */
  product_id: string
  /** SKU ID */
  sku_id: string
  /** 订单状态 (0=待付款, 1=已付款, 2=已结算等) */
  status: number
  /** 实付金额（分） */
  pay_amount: number
  /** 预计佣金（分） */
  commission: number
  /** 佣金比例（万分比） */
  commission_rate: number
  /** 创建时间 */
  create_time: number
  /** 结算时间 */
  settle_time: number
  /** 商品标题 */
  product_title: string
  /** 商品头图 */
  product_img: string
}

export interface WechatProduct {
  /** 商品ID */
  product_id: string
  /** 商品标题 */
  title: string
  /** 商品头图 */
  img_url: string
  /** 售价（分） */
  selling_price: number
  /** 销量 */
  sales: number
  /** 佣金比例（万分比） */
  commission_rate: number
  /** 库存 */
  stock: number
  /** 状态 (0=上架, 1=下架) */
  status: number
}

export interface WechatOrderListResponse {
  errcode: number
  errmsg: string
  order_list: WechatOrder[]
  total_num: number
  has_more: boolean
}

export interface WechatOrderDetailResponse {
  errcode: number
  errmsg: string
  base_info: {
    order_id: string
    order_status: number
    actual_payment: number // 分
    create_time: number
    settle_time: number
    /** 预估佣金（分） */
    predict_commission: number
  }
  product_info: {
    product_id: string
    sku_id: string
    title: string
    head_img: string
    price: number // 分
  }
  commission_info: {
    /** 佣金（分） */
    amount: number
    /** 佣金比例（万分比） */
    rate: number
    status: string
  }
}

export interface WechatProductListResponse {
  errcode: number
  errmsg: string
  products: WechatProduct[]
  total_num: number
}

export interface WechatProductDetailResponse {
  errcode: number
  errmsg: string
  product: WechatProduct
}

export const wechatStoreApi = {
  /** 佣金单列表 */
  getOrders(params?: { page_size?: number; page_index?: number }) {
    return get<WechatOrderListResponse>('/wechat-store/orders', params as Record<string, unknown>)
  },

  /** 佣金单详情 */
  getOrderDetail(orderId: string, skuId: string) {
    return get<WechatOrderDetailResponse>(`/wechat-store/orders/${orderId}`, { sku_id: skuId })
  },

  /** 橱窗商品列表 */
  getProducts(params?: { page_size?: number; page_index?: number }) {
    return get<WechatProductListResponse>(
      '/wechat-store/products',
      params as Record<string, unknown>,
    )
  },

  /** 橱窗商品详情 */
  getProductDetail(productId: string) {
    return get<WechatProductDetailResponse>(`/wechat-store/products/${productId}`)
  },
}
