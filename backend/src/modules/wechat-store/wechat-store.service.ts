import { BadRequestException, ForbiddenException, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { AccountStatus, UserRole } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

interface TokenCache {
  token: string
  expiresAt: number
}

interface ShopInfoCache {
  data: any
  expiresAt: number
  staleUntil: number
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

const SYNC_WINDOW_DAYS = 30
const WECHAT_API_TIMEOUT_MS = 30 * 1000
const WECHAT_STORE_SYNC_TIMEOUT_MS = 4 * 60 * 1000
const SHOP_INFO_CACHE_TTL_MS = 60 * 60 * 1000
const SHOP_INFO_STALE_TTL_MS = 24 * 60 * 60 * 1000
const SHOP_INFO_QUOTA_ERRCODE = 45009

export interface WechatOrderSourceInfo {
  account_type: string
  account_id: string
  account_nickname: string
  sale_channel: string
}

@Injectable()
export class WechatStoreService implements OnModuleInit {
  private readonly logger = new Logger(WechatStoreService.name)
  private readonly baseUrl = 'https://api.weixin.qq.com'
  private readonly tokens = new Map<string, TokenCache>()
  private readonly shopInfoCache = new Map<string, ShopInfoCache>()
  private readonly shopInfoQuotaBlockedUntil = new Map<string, number>()
  private syncRunning = false

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('WechatStoreService initialized')
  }

  async assertStoreAccess(storeId: string, user?: { role?: UserRole; organizationId?: string | null }) {
    if (!storeId) throw new BadRequestException('store_id is required')
    const store = await this.prisma.wechatStore.findUnique({
      where: { id: storeId },
      select: { organizationId: true },
    })
    if (!store) throw new BadRequestException('Store not found')
    if (user?.role === UserRole.SUPER_ADMIN) return
    if (store.organizationId && user?.organizationId === store.organizationId) return
    if (!store.organizationId && !user?.organizationId) return
    throw new ForbiddenException('No access to this store')
  }

  private async getStoreOrganizationId(storeId: string) {
    const store = await this.prisma.wechatStore.findUnique({
      where: { id: storeId },
      select: { organizationId: true },
    })
    if (!store) throw new Error(`Store not found: ${storeId}`)
    return store.organizationId || null
  }

  private storeTenantWhere(storeId: string, organizationId: string | null) {
    return { storeId, organizationId }
  }

  async getStores(user?: { role?: UserRole; organizationId?: string | null }) {
    return this.prisma.wechatStore.findMany({
      where: user?.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user?.organizationId || null },
      orderBy: { createdAt: 'asc' },
      select: safeStoreSelect,
    })
  }

  async createStore(
    name: string,
    appId: string,
    appSecret: string,
    user?: { organizationId?: string | null },
  ) {
    const normalizedName = name?.trim()
    const normalizedAppId = appId?.trim()
    const normalizedAppSecret = appSecret?.trim()

    if (!normalizedName || !normalizedAppId || !normalizedAppSecret) {
      throw new BadRequestException('请填写店铺名称、AppID 和 AppSecret')
    }

    const existing = await this.prisma.wechatStore.findUnique({ where: { appId: normalizedAppId } })
    if (existing) {
      throw new BadRequestException('该 AppID 已添加过微信小店')
    }

    const store = await this.prisma.wechatStore.create({
      data: {
        name: normalizedName,
        appId: normalizedAppId,
        appSecret: normalizedAppSecret,
        organizationId: user?.organizationId || null,
      },
      select: safeStoreSelect,
    })
    void this.syncStore(store.id).catch((error) => {
      this.logger.warn(`Initial sync failed [${store.name}]: ${error.message}`)
    })
    return store
  }

  async deleteStore(id: string, user?: { role?: UserRole; organizationId?: string | null }) {
    await this.assertStoreAccess(id, user)
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
          await this.withTimeout(
            this.syncStore(store.id),
            WECHAT_STORE_SYNC_TIMEOUT_MS,
            `Wechat store sync timed out [${store.name}]`,
          )
          success++
        } catch (error: any) {
          const message = error?.message || 'sync failed'
          failed++
          errors.push({ storeId: store.id, message })
          await this.prisma.wechatStore
            .update({
              where: { id: store.id },
              data: { syncStatus: 'failed', syncError: message },
            })
            .catch((updateError) => {
              this.logger.warn(`Failed to mark WeChat store sync failure [${store.name}]: ${updateError?.message || updateError}`)
            })
          this.logger.warn(`Wechat store sync failed [${store.name}]: ${message}`)
        }
      }
    } finally {
      this.syncRunning = false
    }

    return { skipped: false, total: stores.length, success, failed, errors }
  }

  async syncStore(storeId: string, user?: { role?: UserRole; organizationId?: string | null }) {
    if (user) await this.assertStoreAccess(storeId, user)
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
    const organizationId = await this.getStoreOrganizationId(storeId)
    const cached = await this.prisma.wechatStoreOrder.findFirst({
      where: { storeId, organizationId, orderId },
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
    const cached = this.shopInfoCache.get(storeId)
    const now = Date.now()
    if (cached && now < cached.expiresAt) {
      return { ...cached.data, cached: true }
    }

    const quotaBlockedUntil = this.shopInfoQuotaBlockedUntil.get(storeId) || 0
    if (now < quotaBlockedUntil) {
      if (cached && now < cached.staleUntil) {
        return { ...cached.data, cached: true, stale: true, upstreamErrcode: SHOP_INFO_QUOTA_ERRCODE }
      }
      return {
        errcode: SHOP_INFO_QUOTA_ERRCODE,
        errmsg: 'wechat shop info quota temporarily blocked',
        quotaBlockedUntil,
      }
    }

    const token = await this.getStoreToken(storeId)
    const url = `${this.baseUrl}/channels/ec/basics/info/get?access_token=${token}`
    const res = await this.fetchWithTimeout(url, undefined, 'WeChat basics/info/get')
    const data = await this.readJsonResponse(res, 'WeChat basics/info/get response')
    if (data.errcode) {
      this.logger.warn(`[wechat-store] basics/info/get: ${data.errcode} ${data.errmsg}`)
      if (data.errcode === SHOP_INFO_QUOTA_ERRCODE) {
        this.shopInfoQuotaBlockedUntil.set(storeId, this.nextBeijingMidnightMs(now))
      }
      if (data.errcode === SHOP_INFO_QUOTA_ERRCODE && cached && now < cached.staleUntil) {
        return { ...cached.data, cached: true, stale: true, upstreamErrcode: data.errcode }
      }
    } else {
      this.shopInfoCache.set(storeId, {
        data,
        expiresAt: now + SHOP_INFO_CACHE_TTL_MS,
        staleUntil: now + SHOP_INFO_STALE_TTL_MS,
      })
    }
    return data
  }

  private nextBeijingMidnightMs(nowMs: number) {
    const beijingOffsetMs = 8 * 60 * 60 * 1000
    const beijingNow = new Date(nowMs + beijingOffsetMs)
    const nextUtcMs = Date.UTC(
      beijingNow.getUTCFullYear(),
      beijingNow.getUTCMonth(),
      beijingNow.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    )
    return nextUtcMs - beijingOffsetMs
  }

  async getOrderListAggregated(storeId: string, params: OrderQuery) {
    const organizationId = await this.getStoreOrganizationId(storeId)
    const pageSize = params.page_size || 5000
    const hasRange = params.start_time !== undefined || params.end_time !== undefined
    const where: any = this.storeTenantWhere(storeId, organizationId)
    if (params.status !== undefined) where.status = params.status
    if (hasRange) {
      where.createTime = {
        ...(params.start_time !== undefined && { gte: params.start_time }),
        ...(params.end_time !== undefined && { lte: params.end_time }),
      }
    }

    const rows = await this.prisma.wechatStoreOrder.findMany({
      where,
      orderBy: { createTime: 'desc' },
      ...(hasRange ? {} : { take: pageSize }),
    })

    return {
      errcode: 0,
      errmsg: 'ok',
      order_list: rows.map((row) => {
        const raw = row.raw as any
        const productPrice = raw?.order_detail?.price_info?.product_price ?? row.payAmount
        return {
          order_id: row.orderId,
          product_id: row.productId || '',
          sku_id: row.skuId || '',
          status: row.status,
          pay_amount: row.payAmount,
          product_price: this.toFiniteNumber(productPrice, Number.NaN) || row.payAmount,
          create_time: row.createTime,
          settle_time: row.settleTime,
          product_title: row.productTitle,
          product_img: row.productImg,
          ship_time: row.shipTime,
          delivery_list: row.deliveryList || [],
          source_infos: this.extractSourceInfos(raw),
          commission: 0,
          commission_rate: 0,
        }
      }),
      total_num: rows.length,
      cached: true,
    }
  }

  async getProductListAggregated(storeId: string, params: ProductQuery) {
    const organizationId = await this.getStoreOrganizationId(storeId)
    const pageSize = 1000
    const rows = await this.prisma.wechatStoreProduct.findMany({
      where: this.storeTenantWhere(storeId, organizationId),
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
    const organizationId = await this.getStoreOrganizationId(storeId)
    const now = Math.floor(Date.now() / 1000)
    const hasExplicitRange =
      params.begin_create_time !== undefined || params.end_create_time !== undefined
    const begin = params.begin_create_time || now - 7 * 86400
    const end = params.end_create_time || now
    const rows = await this.prisma.wechatStoreAftersale.findMany({
      where: {
        ...this.storeTenantWhere(storeId, organizationId),
        createTime: { gte: begin, lte: end },
      },
      orderBy: { createTime: 'desc' },
      ...(hasExplicitRange ? {} : { take: 1000 }),
    })

    const list = rows.map((row) => {
      const raw = row.raw as any
      return {
        id: row.afterSaleOrderId,
        order_id: this.getAftersaleOrderId(raw),
        type: row.type,
        status: row.status,
        amount: row.amount,
        reason: row.reason,
        product: row.product,
        complete_time: row.completeTime,
        create_time: row.createTime,
      }
    })
    const totalAmount = list.reduce((sum, item) => sum + item.amount, 0)
    return { errcode: 0, errmsg: 'ok', list, total: list.length, totalAmount, cached: true }
  }

  private async fetchToken(appId: string, appSecret: string, label: string): Promise<string> {
    const url = `${this.baseUrl}/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
    const res = await this.fetchWithTimeout(url, undefined, `WeChat token [${label}]`)
    const data = await this.readJsonResponse(res, 'WeChat token response')
    if (data.errcode) {
      this.logger.error(`[${label}] token fail: ${data.errcode} ${data.errmsg}`)
      throw new Error(data.errmsg)
    }
    return data.access_token
  }

  private getAftersaleOrderId(aftersale: any) {
    return String(
      aftersale?.order_id ||
        aftersale?.orderId ||
        aftersale?.order_info?.order_id ||
        aftersale?.order_info?.orderId ||
        aftersale?.order_detail?.order_id ||
        '',
    )
  }

  private extractSourceInfos(order: any): WechatOrderSourceInfo[] {
    const sourceInfos = order?.order_detail?.source_infos
    if (!Array.isArray(sourceInfos)) return []

    return sourceInfos
      .map((source: any) => ({
        account_type: String(source?.account_type ?? ''),
        account_id: String(source?.account_id ?? ''),
        account_nickname: String(source?.account_nickname ?? ''),
        sale_channel: String(source?.sale_channel ?? ''),
      }))
      .filter((source) => source.account_id || source.account_nickname || source.sale_channel)
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
    const res = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, `WeChat ${path}`)
    const data = await this.readJsonResponse(res, `WeChat ${path} response`)

    if (retry && (data.errcode === 40001 || data.errcode === 42001)) {
      this.tokens.delete(storeId)
      return this.request<T>(storeId, path, body, false)
    }

    if (data.errcode) {
      this.logger.warn(`[wechat-store] ${path}: ${data.errcode} ${data.errmsg}`)
    }
    return data as T
  }

  private async fetchWithTimeout(url: string, init: any = {}, label: string) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), WECHAT_API_TIMEOUT_MS)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Error(`${label} timed out after ${WECHAT_API_TIMEOUT_MS}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeout: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(`${label} after ${timeoutMs}ms`)), timeoutMs)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  private async readJsonResponse(res: any, label: string): Promise<any> {
    let text = ''
    try {
      text = await res.text()
    } catch (error: any) {
      throw new Error(`${label} body read failed: ${error.message || error}`)
    }

    if (!text.trim()) {
      throw new Error(`${label} returned empty body`)
    }

    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${label} returned invalid JSON: ${text.slice(0, 120)}`)
    }
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
      begin_create_time: params.begin_create_time || now - 24 * 3600,
      end_create_time: params.end_create_time || now,
      ...(params.next_key && { next_key: params.next_key }),
    })
  }

  private async syncOrders(storeId: string, syncedAt: Date) {
    const organizationId = await this.getStoreOrganizationId(storeId)
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
          organizationId,
          productId: info.product_id ? String(info.product_id) : null,
          skuId: info.sku_id ? String(info.sku_id) : null,
          status: this.toFiniteNumber(order.status),
          payAmount: this.toFiniteNumber(order.order_detail?.price_info?.order_price),
          createTime: this.toFiniteNumber(order.create_time),
          settleTime: this.toFiniteNumber(order.settle_time),
          productTitle: info.title || '',
          productImg: info.thumb_img || '',
          shipTime: this.toFiniteNumber(delivery.ship_done_time),
          deliveryList: delivery.delivery_product_info || [],
          raw: order || {},
          syncedAt,
        },
        create: {
          storeId,
          organizationId,
          orderId: String(order.order_id),
          productId: info.product_id ? String(info.product_id) : null,
          skuId: info.sku_id ? String(info.sku_id) : null,
          status: this.toFiniteNumber(order.status),
          payAmount: this.toFiniteNumber(order.order_detail?.price_info?.order_price),
          createTime: this.toFiniteNumber(order.create_time),
          settleTime: this.toFiniteNumber(order.settle_time),
          productTitle: info.title || '',
          productImg: info.thumb_img || '',
          shipTime: this.toFiniteNumber(delivery.ship_done_time),
          deliveryList: delivery.delivery_product_info || [],
          raw: order || {},
          syncedAt,
        },
      })
    })
  }

  private async syncProducts(storeId: string, syncedAt: Date) {
    const organizationId = await this.getStoreOrganizationId(storeId)
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
          organizationId,
          title: product.title || '',
          imgUrl: product.head_imgs?.[0] || '',
          sellingPrice: this.toFiniteNumber(sku.sale_price),
          sales: this.toFiniteNumber(product.total_sold_num),
          stock: this.toFiniteNumber(sku.stock_num),
          status: this.toFiniteNumber(product.status),
          raw: product || {},
          syncedAt,
        },
        create: {
          storeId,
          organizationId,
          productId,
          title: product.title || '',
          imgUrl: product.head_imgs?.[0] || '',
          sellingPrice: this.toFiniteNumber(sku.sale_price),
          sales: this.toFiniteNumber(product.total_sold_num),
          stock: this.toFiniteNumber(sku.stock_num),
          status: this.toFiniteNumber(product.status),
          raw: product || {},
          syncedAt,
        },
      })
    })
  }

  private async syncAftersales(storeId: string, syncedAt: Date) {
    const organizationId = await this.getStoreOrganizationId(storeId)
    const ids = await this.collectAftersaleIds(storeId)
    const productRows = await this.prisma.wechatStoreProduct.findMany({
      where: this.storeTenantWhere(storeId, organizationId),
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
          organizationId,
          type: String(aftersale.type || ''),
          status: String(aftersale.status || ''),
          amount: this.toFiniteNumber(aftersale.refund_info?.amount),
          reason: aftersale.reason_text || '',
          product:
            (productId && productMap.get(productId)) || (productId ? `商品${productId}` : ''),
          productId,
          completeTime: this.toFiniteNumber(aftersale.complete_time),
          createTime: this.toFiniteNumber(aftersale.create_time),
          raw: aftersale || {},
          syncedAt,
        },
        create: {
          storeId,
          organizationId,
          afterSaleOrderId,
          type: String(aftersale.type || ''),
          status: String(aftersale.status || ''),
          amount: this.toFiniteNumber(aftersale.refund_info?.amount),
          reason: aftersale.reason_text || '',
          product:
            (productId && productMap.get(productId)) || (productId ? `商品${productId}` : ''),
          productId,
          completeTime: this.toFiniteNumber(aftersale.complete_time),
          createTime: this.toFiniteNumber(aftersale.create_time),
          raw: aftersale || {},
          syncedAt,
        },
      })
    })
  }

  private toFiniteNumber(value: unknown, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  private async collectOrderIds(storeId: string) {
    const ids: string[] = []
    const endTime = Math.floor(Date.now() / 1000)
    const startTime = endTime - SYNC_WINDOW_DAYS * 86400
    const maxWindowSeconds = 7 * 86400 - 1

    for (let windowStart = startTime; windowStart <= endTime; windowStart += maxWindowSeconds + 1) {
      const windowEnd = Math.min(windowStart + maxWindowSeconds, endTime)
      let nextKey: string | undefined

      for (let page = 0; page < 20; page++) {
        const res: any = await this.fetchOrderListRemote(storeId, {
          page_size: 100,
          next_key: nextKey,
          start_time: windowStart,
          end_time: windowEnd,
        })
        if (res.errcode !== 0) throw new Error(res.errmsg || `order list error ${res.errcode}`)
        ids.push(...((res.order_id_list || []) as string[]).map(String))
        nextKey = res.next_key || res.nextKey
        if (!nextKey) break
      }
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
    const now = Math.floor(Date.now() / 1000)

    // 微信 API 限制：售后查询区间不得超过 24 小时
    // 逐天拉取最近 30 天的售后数据
    for (let dayOffset = 0; dayOffset < SYNC_WINDOW_DAYS; dayOffset++) {
      const dayEnd = now - dayOffset * 86400
      const dayBegin = dayEnd - 86400
      let nextKey: string | undefined

      for (let page = 0; page < 20; page++) {
        const res: any = await this.fetchAftersaleListRemote(storeId, {
          next_key: nextKey,
          begin_create_time: dayBegin,
          end_create_time: dayEnd,
        })
        if (res.errcode !== 0) throw new Error(res.errmsg || `aftersale list error ${res.errcode}`)
        ids.push(...((res.after_sale_order_id_list || []) as string[]).map(String))
        nextKey = res.next_key || res.nextKey
        if (!nextKey) break
      }
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
