import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

interface TokenCache {
  token: string
  expiresAt: number
}

@Injectable()
export class WechatStoreService implements OnModuleInit {
  private readonly logger = new Logger(WechatStoreService.name)
  private readonly baseUrl = 'https://api.weixin.qq.com'
  private readonly tokens = new Map<string, TokenCache>()

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('WechatStoreService initialized')
  }

  // ── Store CRUD ──

  async getStores() {
    return this.prisma.wechatStore.findMany({ orderBy: { createdAt: 'asc' } })
  }

  async createStore(name: string, appId: string, appSecret: string) {
    return this.prisma.wechatStore.create({ data: { name, appId, appSecret } })
  }

  async deleteStore(id: string) {
    this.tokens.delete(id)
    return this.prisma.wechatStore.delete({ where: { id } })
  }

  // ── Token ──

  private async fetchToken(appId: string, appSecret: string, label: string): Promise<string> {
    const url = `${this.baseUrl}/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
    const res = await fetch(url)
    const data = (await res.json()) as any
    if (data.errcode) {
      this.logger.error(`[${label}] 获取token失败: ${data.errcode} ${data.errmsg}`)
      throw new Error(`WeChat token error for ${label}: ${data.errmsg}`)
    }
    return data.access_token
  }

  private async getStoreToken(storeId: string): Promise<string> {
    const cached = this.tokens.get(storeId)
    if (cached?.token && Date.now() < cached.expiresAt - 60000) {
      return cached.token
    }

    const store = await this.prisma.wechatStore.findUnique({ where: { id: storeId } })
    if (!store) throw new Error(`WechatStore not found: ${storeId}`)

    const token = await this.fetchToken(store.appId, store.appSecret, store.name)
    this.tokens.set(storeId, { token, expiresAt: Date.now() + 7100 * 1000 })
    return token
  }

  // ── API ──

  private async request<T>(
    storeId: string,
    path: string,
    body: Record<string, any> = {},
  ): Promise<T> {
    const token = await this.getStoreToken(storeId)
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

  async getOrderList(
    storeId: string,
    params: { page_size?: number; next_key?: string; status?: number },
  ) {
    return this.request(storeId, '/channels/ec/order/list/get', {
      page_size: params.page_size || 10,
      ...(params.next_key && { next_key: params.next_key }),
      ...(params.status !== undefined && { status: params.status }),
    })
  }

  async getOrderDetail(storeId: string, orderId: string) {
    return this.request(storeId, '/channels/ec/order/get', { order_id: orderId })
  }

  async getProductList(storeId: string, params: { page_size?: number; next_key?: string }) {
    return this.request(storeId, '/channels/ec/product/list/get', {
      page_size: params.page_size || 20,
      ...(params.next_key && { next_key: params.next_key }),
    })
  }
}
