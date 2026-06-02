import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

interface TokenCache { token: string; expiresAt: number }

@Injectable()
export class WechatStoreService implements OnModuleInit {
  private readonly logger = new Logger(WechatStoreService.name)
  private readonly baseUrl = 'https://api.weixin.qq.com'
  private readonly tokens = new Map<string, TokenCache>()
  constructor(private prisma: PrismaService) {}
  onModuleInit() { this.logger.log('WechatStoreService initialized') }

  // Store CRUD
  async getStores() { return this.prisma.wechatStore.findMany({ orderBy: { createdAt: 'asc' } }) }
  async createStore(name: string, appId: string, appSecret: string) { return this.prisma.wechatStore.create({ data: { name, appId, appSecret } }) }
  async deleteStore(id: string) { this.tokens.delete(id); return this.prisma.wechatStore.delete({ where: { id } }) }

  // Token
  private async fetchToken(appId: string, appSecret: string, label: string): Promise<string> {
    const url = `${this.baseUrl}/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
    const res = await fetch(url); const data = (await res.json()) as any
    if (data.errcode) { this.logger.error(`[${label}] token fail: ${data.errcode}`); throw new Error(data.errmsg) }
    return data.access_token
  }
  private async getStoreToken(storeId: string): Promise<string> {
    const c = this.tokens.get(storeId)
    if (c?.token && Date.now() < c.expiresAt - 60000) return c.token
    const store = await this.prisma.wechatStore.findUnique({ where: { id: storeId } })
    if (!store) throw new Error(`Store not found: ${storeId}`)
    const token = await this.fetchToken(store.appId, store.appSecret, store.name)
    this.tokens.set(storeId, { token, expiresAt: Date.now() + 7100 * 1000 })
    return token
  }
  private async request<T>(storeId: string, path: string, body: Record<string, any> = {}): Promise<T> {
    const token = await this.getStoreToken(storeId)
    const url = `${this.baseUrl}${path}?access_token=${token}`
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = (await res.json()) as any
    if (data.errcode) this.logger.warn(`[小店] ${path}: ${data.errcode} ${data.errmsg}`)
    return data as T
  }

  // Raw APIs
  async getOrderList(storeId: string, params: { page_size?: number; next_key?: string; status?: number }) {
    const now = Math.floor(Date.now() / 1000)
    return this.request(storeId, '/channels/ec/order/list/get', { page_size: params.page_size || 10, create_time_range: { start_time: now - 7 * 86400, end_time: now }, ...(params.next_key && { next_key: params.next_key }), ...(params.status !== undefined && { status: params.status }) })
  }
  async getOrderDetail(storeId: string, orderId: string) { return this.request(storeId, '/channels/ec/order/get', { order_id: orderId }) }
  async getProductList(storeId: string, params: { page_size?: number; next_key?: string }) { return this.request(storeId, '/channels/ec/product/list/get', { page_size: params.page_size || 20, ...(params.next_key && { next_key: params.next_key }) }) }
  async getAftersaleList(storeId: string, params: { begin_create_time?: number; end_create_time?: number; next_key?: string }) {
    const now = Math.floor(Date.now() / 1000)
    return this.request(storeId, '/channels/ec/aftersale/getaftersalelist', { begin_create_time: params.begin_create_time || now - 24 * 3600, end_create_time: params.end_create_time || now, ...(params.next_key && { next_key: params.next_key }) })
  }
  async getShopInfo(storeId: string) {
    const token = await this.getStoreToken(storeId)
    const url = `${this.baseUrl}/channels/ec/basics/info/get?access_token=${token}`
    const res = await fetch(url)
    const data = (await res.json()) as any
    if (data.errcode) this.logger.warn(`[小店] basics/info/get: ${data.errcode} ${data.errmsg}`)
    return data
  }

  // Aggregated methods
  async getOrderListAggregated(storeId: string, params: { page_size?: number; next_key?: string; status?: number }) {
    const res: any = await this.getOrderList(storeId, params)
    if (res.errcode !== 0) return res
    const ids: string[] = res.order_id_list || []
    if (ids.length === 0) return { errcode: 0, errmsg: 'ok', order_list: [], total_num: 0 }
    const details = await Promise.all(ids.map((id: string) => this.getOrderDetail(storeId, id)))
    const order_list = details.filter((d: any) => d.errcode === 0).map((d: any) => {
      const o = d.order || {}; const info = o.order_detail?.product_infos?.[0] || {}
      return { order_id: o.order_id, product_id: info.product_id || '', sku_id: info.sku_id || '', status: o.status || 0, pay_amount: o.order_detail?.price_info?.order_price || 0, create_time: o.create_time || 0, settle_time: o.settle_time || 0, product_title: info.title || '', product_img: info.thumb_img || '', commission: 0, commission_rate: 0 }
    })
    return { errcode: 0, errmsg: 'ok', order_list, total_num: res.total_num || order_list.length }
  }
  async getProductListAggregated(storeId: string, params: { page_size?: number; next_key?: string }) {
    const res: any = await this.getProductList(storeId, params)
    if (res.errcode !== 0) return res
    const ids: string[] = res.product_ids || []
    if (ids.length === 0) return { errcode: 0, errmsg: 'ok', products: [], total_num: 0 }
    const details = await Promise.all(ids.map((id: string) => this.request(storeId, '/channels/ec/product/get', { product_id: String(id) })))
    const products = details.filter((d: any) => d.errcode === 0).map((d: any) => { const p = d.product || d; const sku = p.skus?.[0] || {}; return { product_id: p.product_id, title: p.title || '', img_url: p.head_imgs?.[0] || '', selling_price: sku.sale_price || 0, sales: p.total_sold_num || 0, stock: sku.stock_num || 0, commission_rate: 0, status: p.status || 0 } })
    return { errcode: 0, errmsg: 'ok', products, total_num: res.total_num || products.length }
  }
}
