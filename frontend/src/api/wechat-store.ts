/**
 * 微信小店 API
 * 数据来源: 后端 wechat-store 模块（@Public 端点）
 */
import { get, post, del } from './request'

// ── 店铺 ──

export interface WechatStore {
  id: string
  name: string
  appId: string
  status: string
  createdAt: string
  updatedAt: string
}

export const wechatStoreApi = {
  /** 获取店铺列表 */
  getStores() {
    return get<WechatStore[]>('/wechat-store/stores')
  },

  /** 添加店铺 */
  createStore(data: { name: string; appId: string; appSecret: string }) {
    return post<WechatStore>('/wechat-store/stores', data)
  },

  /** 删除店铺 */
  deleteStore(id: string) {
    return del(`/wechat-store/stores/${id}`)
  },

  // ── 订单 ──

  /** 小店订单列表 */
  getOrders(storeId: string, params?: { page_size?: number; next_key?: string; status?: number }) {
    return get<any>('/wechat-store/shop/orders', { store_id: storeId, ...params })
  },

  /** 小店订单详情 */
  getOrderDetail(storeId: string, orderId: string) {
    return get<any>(`/wechat-store/shop/orders/${orderId}`, { store_id: storeId })
  },

  // ── 商品 ──

  /** 小店商品列表 */
  getProducts(storeId: string, params?: { page_size?: number; next_key?: string }) {
    return get<any>('/wechat-store/shop/products', { store_id: storeId, ...params })
  },

  // ── 售后 ──

  /** 售后单列表 */
  getAftersaleCount(
    storeId: string,
    params?: { begin_create_time?: number; end_create_time?: number; next_key?: string },
  ) {
    return get<any>('/wechat-store/shop/aftersale', { store_id: storeId, ...params })
  },

  // ── 店铺 ──

  /** 店铺基本信息 */
  getShopInfo(storeId: string) {
    return get<any>('/wechat-store/shop/info', { store_id: storeId })
  },
}

// ── 兼容旧类型 ──

export interface WechatOrder {
  order_id: string
  product_id: string
  sku_id: string
  status: number
  pay_amount: number
  product_price?: number
  commission: number
  commission_rate: number
  create_time: number
  settle_time: number
  ship_time?: number
  product_title: string
  product_img: string
}

export interface WechatProduct {
  product_id: string
  title: string
  img_url: string
  selling_price: number
  sales: number
  commission_rate: number
  stock: number
  status: number
}

export interface WechatAftersale {
  id: string
  order_id?: string
  type: string
  status: string
  amount: number
  reason: string
  product: string
  complete_time: number
  create_time: number
}
