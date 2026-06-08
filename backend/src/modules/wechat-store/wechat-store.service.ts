import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { AccountStatus } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

interface TokenCache {
  token: string
  expiresAt: number
}

interface OrderQuery {
  page_size?: number
  next_key?: string
  status?: number
  start_time?: number
  end_time?: number
}

interface ProductQuery {
  page_size?: number
  next_key?: string
}

interface AftersaleQuery {
  begin_create_time?: number
  end_create_time?: number
  next_key?: string
}

const safeStoreSelect = {
  id: true,
  name: true,
  appId: true,
  status: true,
  lastSyncedAt: true,
  syncStatus: true,
  syncError: true,
  createdAt: true,
  updatedAt: true,
} as const

@Injectable()
export class WechatStoreService implements OnModuleInit {
  private readonly logger = new Logger(WechatStoreService.name)
  private readonly baseUrl = 'https://api.weixin.qq.com'
  private readonly tokens = new Map<string, TokenCache>()
  private syncRunning = false

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('WechatStoreService initialized')
  }

  async getStores() {
    return this.prisma.wechatStore.findMany({
      orderBy: { createdAt: 'asc' },
      select: safeStoreSelect,
    })
  }

  async createStore(name: string, appId: string, appSecret: string) {
    const store = await this.prisma.wechatStore.create({
      data: { name, appId, appSecret },
      select: safeStoreSelect,
    })
    void this.syncStore(store.id).catch((error) => {
      this.logger.warn(`Initial sync failed [${store.name}]: ${error.message}`)
    })
    return store
  }

  async deleteStore(id: string) {
    this.tokens.delete(id)
    return this.prisma.wechatStore.delete({ where: { id }, select: safeStoreSelect })
  }

  async syncAllStores() {
    if (this.syncRunning) {
      return { skipped: true, reason: 'sync already running' }
    }

    this.syncRunning = true
    const stores = await this.prisma.wechatStore.findMany({
      where: { status: AccountStatus.ACTIVE },
      select: { id: true, name: true },
    })

    let success = 0
    let failed = 0
    const errors: Array<{ storeId: string; message: string }> = []

    try {
      for (const store of stores) {
        try {
          await this.syncStore(store.id)
          success++
        } catch (error: any) {
          failed++
          errors.push({ storeId: store.id, message: error.message })
          this.logger.warn(`Wechat store sync failed [${store.name}]: ${error.message}`)
        }
      }
    } finally {
      this.syncRunning = false
    }

    return { skipped: false, total: stores.length, success, failed, errors }
  }

  async syncStore(storeId: string) {
    const startedAt = new Date()
    await this.prisma.wechatStore.update({
      where: { id: storeId },
      data: { syncStatus: 'syncing', syncError: null },
    })

    try {
      await this.syncProducts(storeId, startedAt)
      await this.syncOrders(storeId, startedAt)
      await this.syncAftersales(storeId, startedAt)

      await this.prisma.wechatStore.update({
        where: { id: storeId },
        data: { lastSyncedAt: new Date(), syncStatus: 'ok', syncError: null },
      })
    } catch (error: any) {
      await this.prisma.wechatStore.update({
        where: { id: storeId },
        data: {
          syncStatus: 'failed',
          syncError: String(error?.message || error).slice(0, 1000),
        },
      })
      throw error
    }
  }

  async getOrderList(paramsStoreId: string, params: OrderQuery) {
    return this.fetchOrderListRemote(paramsStoreId, params)
  }

  async getOrderDetail(storeId: string, orderId: string) {
    const cached = await this.prisma.wechatStoreOrder.findUnique({
      where: { storeId_orderId: { storeId, orderId } },
      select: { raw: true },
    })
    if (cached) return { errcode: 0, errmsg: 'ok', order: cached.raw }
    return this.request(storeId, '/channels/ec/order/get', { order_id: orderId })
  }

  async getProductList(storeId: string, params: ProductQuery) {
    return this.fetchProductListRemote(storeId, params)
  }

  async getAftersaleList(storeId: string, params: AftersaleQuery) {
    return this.fetchAftersaleListRemote(storeId, params)
  }

  async getAftersaleDetail(storeId: string, afterSaleOrderId: string) {
    return this.request(storeId, '/channels/ec/aftersale/getaftersaleorder', {
      after_sale_order_id: afterSaleOrderId,
    })
  }

  async getShopInfo(storeId: string) {
    const token = await this.getStoreToken(storeId)
    const url = `${this.baseUrl}/channels/ec/basics/info/get?access_token=${token}`
    const res = await fetch(url)
    const data = (await res.json()) as any
    if (data.errcode)
      this.logger.warn(`[wechat-store] basics/info/get: ${data.errcode} ${data.errmsg}`)
    return data
  }

  async getOrderListAggregated(storeId: string, params: OrderQuery) {
    const pageSize = 1000
    const where: any = { storeId }
    if (params.status !== undefined) where.status = params.status

    const rows = await this.prisma.wechatStoreOrder.findMany({
      where,
      orderBy: { createTime: 'desc' },
      take: pageSize,
    })

    return {
      errcode: 0,
      errmsg: 'ok',
      order_list: rows.map((row) => ({
        order_id: row.orderId,
        product_id: row.productId || '',
        sku_id: row.skuId || '',
        status: row.status,
        pay_amount: row.payAmount,
        create_time: row.createTime,
        settle_time: row.settleTime,
        product_title: row.productTitle,
        product_img: row.productImg,
        ship_time: row.shipTime,
        delivery_list: row.deliveryList || [],
        commission: 0,
        commission_rate: 0,
      })),
      total_num: rows.length,
      cached: true,
    }
  }

  async getProductListAggregated(storeId: string, params: ProductQuery) {
    const pageSize = 1000
    const rows = await this.prisma.wechatStoreProduct.findMany({
      where: { storeId },
      orderBy: [{ sales: 'desc' }, { updatedAt: 'desc' }],
      take: pageSize,
    })

    return {
      errcode: 0,
      errmsg: 'ok',
      products: rows.map((row) => ({
        product_id: row.productId,
        title: row.title,
        img_url: row.imgUrl,
        selling_price: row.sellingPrice,
        sales: row.sales,
        stock: row.stock,
        commission_rate: 0,
        status: row.status,
      })),
      total_num: rows.length,
      cached: true,
    }
  }

  async getAftersaleListAggregated(storeId: string, params: AftersaleQuery = {}) {
    const now = Math.floor(Date.now() / 1000)
    const begin = params.begin_create_time || now - 24 * 3600
    const end = params.end_create_time || now
    const rows = await this.prisma.wechatStoreAftersale.findMany({
      where: {
        storeId,
        createTime: { gte: begin, lte: end },
      },
      orderBy: { createTime: 'desc' },
      take: 1000,
    })

    const list = rows.map((row) => ({
      id: row.afterSaleOrderId,
      type: row.type,
      status: row.status,
      amount: row.amount,
      reason: row.reason,
      product: row.product,
      complete_time: row.completeTime,
      create_time: row.createTime,
    }))
    const totalAmount = list.reduce((sum, item) => sum + item.amount, 0)
    return { errcode: 0, errmsg: 'ok', list, total: list.length, totalAmount, cached: true }
  }

  private async fetchToken(appId: string, appSecret: string, label: string): Promise<string> {
    const url = `${this.baseUrl}/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
    const res = await fetch(url)
    const data = (await res.json()) as any
    if (data.errcode) {
      this.logger.error(`[${label}] token fail: ${data.errcode} ${data.errmsg}`)
      throw new Error(data.errmsg)
    }
    return data.access_token
  }

  private async getStoreToken(storeId: string): Promise<string> {
    const cache = this.tokens.get(storeId)
    if (cache?.token && Date.now() < cache.expiresAt - 60000) return cache.token

    const store = await this.prisma.wechatStore.findUnique({ where: { id: storeId } })
    if (!store) throw new Error(`Store not found: ${storeId}`)

    const token = await this.fetchToken(store.appId, store.appSecret, store.name)
    this.tokens.set(storeId, { token, expiresAt: Date.now() + 7100 * 1000 })
    return token
  }

  private async request<T>(
    storeId: string,
    path: string,
    body: Record<string, any> = {},
    retry = true,
  ): Promise<T> {
    const token = await this.getStoreToken(storeId)
    const url = `${this.baseUrl}${path}?access_token=${token}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as any

    if (retry && (data.errcode === 40001 || data.errcode === 42001)) {
      this.tokens.delete(storeId)
      return this.request<T>(storeId, path, body, false)
    }

    if (data.errcode) {
      this.logger.warn(`[wechat-store] ${path}: ${data.errcode} ${data.errmsg}`)
    }
    return data as T
  }

  private async fetchOrderListRemote(storeId: string, params: OrderQuery) {
    const now = Math.floor(Date.now() / 1000)
    return this.request(storeId, '/channels/ec/order/list/get', {
      page_size: params.page_size || 100,
      create_time_range: {
        start_time: params.start_time || now - 7 * 86400,
        end_time: params.end_time || now,
      },
      ...(params.next_key && { next_key: params.next_key }),
      ...(params.status !== undefined && { status: params.status }),
    })
  }

  private async fetchProductListRemote(storeId: string, params: ProductQuery) {
    return this.request(storeId, '/channels/ec/product/list/get', {
      page_size: params.page_size || 100,
      ...(params.next_key && { next_key: params.next_key }),
    })
  }

  private async fetchAftersaleListRemote(storeId: string, params: AftersaleQuery) {
    const now = Math.floor(Date.now() / 1000)
    return this.request(storeId, '/channels/ec/aftersale/getaftersalelist', {
      begin_create_time: params.begin_create_time || now - 7 * 24 * 3600,
      end_create_time: params.end_create_time || now,
      ...(params.next_key && { next_key: params.next_key }),
    })
  }

  private async syncOrders(storeId: string, syncedAt: Date) {
    const ids = await this.collectOrderIds(storeId)
    const details = await this.mapLimit(ids, 8, (id) => this.getOrderDetailRemote(storeId, id))
    const valid = details.filter((detail: any) => detail?.errcode === 0)

    await this.mapLimit(valid, 8, async (detail: any) => {
      const order = detail.order || {}
      const info = order.order_detail?.product_infos?.[0] || {}
      const delivery = order.order_detail?.delivery_info || {}

      await this.prisma.wechatStoreOrder.upsert({
        where: { storeId_orderId: { storeId, orderId: String(order.order_id) } },
        update: {
          productId: info.product_id ? String(info.product_id) : null,
          skuId: info.sku_id ? String(info.sku_id) : null,
          status: Number(order.status || 0),
          payAmount: Number(order.order_detail?.price_info?.order_price || 0),
          createTime: Number(order.create_time || 0),
          settleTime: Number(order.settle_time || 0),
          productTitle: info.title || '',
          productImg: info.thumb_img || '',
          shipTime: Number(delivery.ship_done_time || 0),
          deliveryList: delivery.delivery_product_info || [],
          raw: order || {},
          syncedAt,
        },
        create: {
          storeId,
          orderId: String(order.order_id),
          productId: info.product_id ? String(info.product_id) : null,
          skuId: info.sku_id ? String(info.sku_id) : null,
          status: Number(order.status || 0),
          payAmount: Number(order.order_detail?.price_info?.order_price || 0),
          createTime: Number(order.create_time || 0),
          settleTime: Number(order.settle_time || 0),
          productTitle: info.title || '',
          productImg: info.thumb_img || '',
          shipTime: Number(delivery.ship_done_time || 0),
          deliveryList: delivery.delivery_product_info || [],
          raw: order || {},
          syncedAt,
        },
      })
    })
  }

  private async syncProducts(storeId: string, syncedAt: Date) {
    const ids = await this.collectProductIds(storeId)
    const details = await this.mapLimit(ids, 8, (id) =>
      this.request(storeId, '/channels/ec/product/get', { product_id: String(id) }),
    )
    const valid = details.filter((detail: any) => detail?.errcode === 0)

    await this.mapLimit(valid, 8, async (detail: any) => {
      const product = detail.product || detail
      const sku = product.skus?.[0] || {}
      const productId = String(product.product_id || '')
      if (!productId) return

      await this.prisma.wechatStoreProduct.upsert({
        where: { storeId_productId: { storeId, productId } },
        update: {
          title: product.title || '',
          imgUrl: product.head_imgs?.[0] || '',
          sellingPrice: Number(sku.sale_price || 0),
          sales: Number(product.total_sold_num || 0),
          stock: Number(sku.stock_num || 0),
          status: Number(product.status || 0),
          raw: product || {},
          syncedAt,
        },
        create: {
          storeId,
          productId,
          title: product.title || '',
          imgUrl: product.head_imgs?.[0] || '',
          sellingPrice: Number(sku.sale_price || 0),
          sales: Number(product.total_sold_num || 0),
          stock: Number(sku.stock_num || 0),
          status: Number(product.status || 0),
          raw: product || {},
          syncedAt,
        },
      })
    })
  }

  private async syncAftersales(storeId: string, syncedAt: Date) {
    const ids = await this.collectAftersaleIds(storeId)
    const productRows = await this.prisma.wechatStoreProduct.findMany({
      where: { storeId },
      select: { productId: true, title: true },
    })
    const productMap = new Map(productRows.map((row) => [row.productId, row.title]))

    const details = await this.mapLimit(ids, 8, (id) => this.getAftersaleDetail(storeId, id))
    const valid = details.filter((detail: any) => detail?.errcode === 0)

    await this.mapLimit(valid, 8, async (detail: any) => {
      const aftersale = detail.after_sale_order || {}
      const productId = aftersale.product_info?.product_id
        ? String(aftersale.product_info.product_id)
        : null
      const afterSaleOrderId = String(aftersale.after_sale_order_id || '')
      if (!afterSaleOrderId) return

      await this.prisma.wechatStoreAftersale.upsert({
        where: { storeId_afterSaleOrderId: { storeId, afterSaleOrderId } },
        update: {
          type: String(aftersale.type || ''),
          status: String(aftersale.status || ''),
          amount: Number(aftersale.refund_info?.amount || 0),
          reason: aftersale.reason_text || '',
          product:
            (productId && productMap.get(productId)) || (productId ? `商品${productId}` : ''),
          productId,
          completeTime: Number(aftersale.complete_time || 0),
          createTime: Number(aftersale.create_time || 0),
          raw: aftersale || {},
          syncedAt,
        },
        create: {
          storeId,
          afterSaleOrderId,
          type: String(aftersale.type || ''),
          status: String(aftersale.status || ''),
          amount: Number(aftersale.refund_info?.amount || 0),
          reason: aftersale.reason_text || '',
          product:
            (productId && productMap.get(productId)) || (productId ? `商品${productId}` : ''),
          productId,
          completeTime: Number(aftersale.complete_time || 0),
          createTime: Number(aftersale.create_time || 0),
          raw: aftersale || {},
          syncedAt,
        },
      })
    })
  }

  private async collectOrderIds(storeId: string) {
    const ids: string[] = []
    let nextKey: string | undefined

    for (let page = 0; page < 20; page++) {
      const res: any = await this.fetchOrderListRemote(storeId, {
        page_size: 100,
        next_key: nextKey,
      })
      if (res.errcode !== 0) throw new Error(res.errmsg || `order list error ${res.errcode}`)
      ids.push(...((res.order_id_list || []) as string[]).map(String))
      nextKey = res.next_key || res.nextKey
      if (!nextKey) break
    }

    return [...new Set(ids)]
  }

  private async collectProductIds(storeId: string) {
    const ids: string[] = []
    let nextKey: string | undefined

    for (let page = 0; page < 20; page++) {
      const res: any = await this.fetchProductListRemote(storeId, {
        page_size: 100,
        next_key: nextKey,
      })
      if (res.errcode !== 0) throw new Error(res.errmsg || `product list error ${res.errcode}`)
      ids.push(...((res.product_ids || []) as string[]).map(String))
      nextKey = res.next_key || res.nextKey
      if (!nextKey) break
    }

    return [...new Set(ids)]
  }

  private async collectAftersaleIds(storeId: string) {
    const ids: string[] = []
    let nextKey: string | undefined

    for (let page = 0; page < 20; page++) {
      const res: any = await this.fetchAftersaleListRemote(storeId, {
        next_key: nextKey,
      })
      if (res.errcode !== 0) throw new Error(res.errmsg || `aftersale list error ${res.errcode}`)
      ids.push(...((res.after_sale_order_id_list || []) as string[]).map(String))
      nextKey = res.next_key || res.nextKey
      if (!nextKey) break
    }

    return [...new Set(ids)]
  }

  private async getOrderDetailRemote(storeId: string, orderId: string) {
    return this.request(storeId, '/channels/ec/order/get', { order_id: orderId })
  }

  private async mapLimit<T, R>(
    items: T[],
    limit: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length)
    let cursor = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++
        results[index] = await mapper(items[index])
      }
    })
    await Promise.all(workers)
    return results
  }
}
