import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface TokenCache {
  token: string
  expiresAt: number
}

@Injectable()
export class WechatStoreService implements OnModuleInit {
  private readonly logger = new Logger(WechatStoreService.name)
  private readonly baseUrl = 'https://api.weixin.qq.com'
  private tokenCache: TokenCache = { token: '', expiresAt: 0 }
  private appid: string
  private secret: string

  constructor(private configService: ConfigService) {
    this.appid = this.configService.get<string>('WECHAT_STORE_APPID') || ''
    this.secret = this.configService.get<string>('WECHAT_STORE_SECRET') || ''
  }

  onModuleInit() {
    if (!this.appid || !this.secret) {
      this.logger.warn('WECHAT_STORE_APPID/SECRET 未配置，微信小店接口不可用')
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache.token && Date.now() < this.tokenCache.expiresAt - 60000) {
      return this.tokenCache.token
    }
    const url = `${this.baseUrl}/cgi-bin/token?grant_type=client_credential&appid=${this.appid}&secret=${this.secret}`
    const res = await fetch(url)
    const data = (await res.json()) as any
    if (data.errcode) {
      this.logger.error(`获取token失败: ${data.errcode} ${data.errmsg}`)
      throw new Error(`WeChat token error: ${data.errmsg}`)
    }
    this.tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
    return data.access_token
  }

  private async request<T>(path: string, body: Record<string, any> = {}): Promise<T> {
    const token = await this.getAccessToken()
    const url = `${this.baseUrl}${path}?access_token=${token}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as any
    if (data.errcode) {
      this.logger.warn(`微信API ${path}: ${data.errcode} ${data.errmsg}`)
    }
    return data as T
  }

  // 1. 佣金单列表
  async getOrderList(params: { page_size?: number; next_key?: string; order_id?: string }) {
    return this.request('/channels/ec/talent/get_order_list', {
      page_size: params.page_size || 10,
      ...(params.next_key && { next_key: params.next_key }),
      ...(params.order_id && { order_id: params.order_id }),
    })
  }

  // 2. 佣金单详情
  async getOrderDetail(orderId: string, skuId: string, specialId?: string) {
    return this.request('/channels/ec/talent/get_order_detail', {
      order_id: orderId,
      sku_id: skuId,
      ...(specialId && { special_id: specialId }),
    })
  }

  // 3. 橱窗商品列表
  async getProductList(params: { page_size?: number; page_index?: number; last_buffer?: string }) {
    const body: Record<string, any> = { page_size: params.page_size || 20 }
    if (params.last_buffer) body.last_buffer = params.last_buffer
    else body.page_index = params.page_index || 1
    return this.request('/channels/ec/talent/window/product/list/get', body)
  }

  // 4. 橱窗商品详情
  async getProductDetail(productId: string) {
    return this.request('/channels/ec/talent/window/product/get', { product_id: productId })
  }
}
