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

  // 唐商披星（小店商家）
  private storeAppid: string
  private storeSecret: string
  private storeToken: TokenCache = { token: '', expiresAt: 0 }

  // 带货助手（达人）
  private talentAppid: string
  private talentSecret: string
  private talentToken: TokenCache = { token: '', expiresAt: 0 }

  constructor(private configService: ConfigService) {
    this.storeAppid = this.configService.get<string>('WECHAT_STORE_APPID') || ''
    this.storeSecret = this.configService.get<string>('WECHAT_STORE_SECRET') || ''
    this.talentAppid = this.configService.get<string>('WECHAT_TALENT_APPID') || ''
    this.talentSecret = this.configService.get<string>('WECHAT_TALENT_SECRET') || ''
  }

  onModuleInit() {
    if (!this.storeAppid || !this.storeSecret) {
      this.logger.warn('WECHAT_STORE_APPID/SECRET 未配置，小店接口不可用')
    }
    if (!this.talentAppid || !this.talentSecret) {
      this.logger.warn('WECHAT_TALENT_APPID/SECRET 未配置，带货助手接口不可用')
    }
  }

  private async fetchToken(appid: string, secret: string, label: string): Promise<string> {
    const url = `${this.baseUrl}/cgi-bin/token?grant_type=client_credential&appid=${appid}&secret=${secret}`
    const res = await fetch(url)
    const data = (await res.json()) as any
    if (data.errcode) {
      this.logger.error(`[${label}] 获取token失败: ${data.errcode} ${data.errmsg}`)
      throw new Error(`WeChat ${label} token error: ${data.errmsg}`)
    }
    return data.access_token
  }

  private async getStoreToken(): Promise<string> {
    if (this.storeToken.token && Date.now() < this.storeToken.expiresAt - 60000) {
      return this.storeToken.token
    }
    const token = await this.fetchToken(this.storeAppid, this.storeSecret, '唐商披星')
    this.storeToken = { token, expiresAt: Date.now() + 7100 * 1000 }
    return token
  }

  private async getTalentToken(): Promise<string> {
    if (this.talentToken.token && Date.now() < this.talentToken.expiresAt - 60000) {
      return this.talentToken.token
    }
    const token = await this.fetchToken(this.talentAppid, this.talentSecret, '带货助手')
    this.talentToken = { token, expiresAt: Date.now() + 7100 * 1000 }
    return token
  }

  private async requestStore<T>(path: string, body: Record<string, any> = {}): Promise<T> {
    const token = await this.getStoreToken()
    const url = `${this.baseUrl}${path}?access_token=${token}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as any
    if (data.errcode) this.logger.warn(`[小店] ${path}: ${data.errcode} ${data.errmsg}`)
    return data as T
  }

  private async requestTalent<T>(path: string, body: Record<string, any> = {}): Promise<T> {
    const token = await this.getTalentToken()
    const url = `${this.baseUrl}${path}?access_token=${token}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as any
    if (data.errcode) this.logger.warn(`[带货助手] ${path}: ${data.errcode} ${data.errmsg}`)
    return data as T
  }

  // ============ 带货助手（达人） ============

  async getOrderList(params: { page_size?: number; next_key?: string; order_id?: string }) {
    return this.requestTalent('/channels/ec/talent/get_order_list', {
      page_size: params.page_size || 10,
      ...(params.next_key && { next_key: params.next_key }),
      ...(params.order_id && { order_id: params.order_id }),
    })
  }

  async getOrderDetail(orderId: string, skuId: string, specialId?: string) {
    return this.requestTalent('/channels/ec/talent/get_order_detail', {
      order_id: orderId,
      sku_id: skuId,
      ...(specialId && { special_id: specialId }),
    })
  }

  async getProductList(params: { page_size?: number; page_index?: number; last_buffer?: string }) {
    const body: Record<string, any> = { page_size: params.page_size || 20 }
    if (params.last_buffer) body.last_buffer = params.last_buffer
    else body.page_index = params.page_index || 1
    return this.requestTalent('/channels/ec/talent/window/product/list/get', body)
  }

  async getProductDetail(productId: string) {
    return this.requestTalent('/channels/ec/talent/window/product/get', { product_id: productId })
  }

  // ============ 唐商披星（小店商家） ============

  async getShopOrderList(params: { page_size?: number; next_key?: string; status?: number }) {
    return this.requestStore('/channels/ec/order/list/get', {
      page_size: params.page_size || 10,
      ...(params.next_key && { next_key: params.next_key }),
      ...(params.status !== undefined && { status: params.status }),
    })
  }

  async getShopOrderDetail(orderId: string) {
    return this.requestStore('/channels/ec/order/get', { order_id: orderId })
  }

  async getShopProductList(params: { page_size?: number; next_key?: string }) {
    return this.requestStore('/channels/ec/product/list/get', {
      page_size: params.page_size || 20,
      ...(params.next_key && { next_key: params.next_key }),
    })
  }
}
