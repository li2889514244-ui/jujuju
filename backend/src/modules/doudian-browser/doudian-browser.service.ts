import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { AccountStatus } from '@prisma/client'
import * as fs from 'fs'
import * as path from 'path'
import { PrismaService } from '../../prisma/prisma.service'
import {
  buildDoudianSummary,
  type DoudianAftersaleMetric,
  type DoudianOrderMetric,
  type DoudianViewMode,
} from './doudian-store-metrics'

type BrowserContext = any
type Page = any

type CapturedEndpoint = keyof CapturedData

interface CapturedData {
  orders?: any
  orderCounts?: any
  products?: any
  productCounts?: any
  aftersales?: any
  aftersaleCounts?: any
}

interface OrderListQuery {
  start_time?: number
  end_time?: number
}

interface AftersaleListQuery {
  begin_create_time?: number
  end_create_time?: number
}

const safeStoreSelect = {
  id: true,
  name: true,
  profilePath: true,
  status: true,
  lastSyncedAt: true,
  syncStatus: true,
  syncError: true,
  sessionStatus: true,
  createdAt: true,
  updatedAt: true,
} as const

const DEFAULT_PROFILE_ROOT = 'doudian_profiles'
const MAX_PAGINATION_PAGES = 60

@Injectable()
export class DoudianBrowserService implements OnModuleInit {
  private readonly logger = new Logger(DoudianBrowserService.name)
  private syncRunning = false

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('DoudianBrowserService initialized')
  }

  async getStores() {
    return (this.prisma as any).doudianStore.findMany({
      orderBy: { createdAt: 'asc' },
      select: safeStoreSelect,
    })
  }

  async createStore(name: string, profilePath?: string) {
    const normalizedProfilePath = this.resolveProfilePath(
      profilePath || path.join(DEFAULT_PROFILE_ROOT, this.safeProfileName(name)),
    )
    fs.mkdirSync(normalizedProfilePath, { recursive: true })

    return (this.prisma as any).doudianStore.create({
      data: { name, profilePath: normalizedProfilePath },
      select: safeStoreSelect,
    })
  }

  async createCompanionStore(name: string, localProfileId?: string) {
    const profilePath = `companion:${localProfileId || this.safeProfileName(name)}`
    const existing = await (this.prisma as any).doudianStore.findUnique({
      where: { profilePath },
      select: safeStoreSelect,
    })
    if (existing) {
      return (this.prisma as any).doudianStore.update({
        where: { id: existing.id },
        data: { name, status: AccountStatus.ACTIVE },
        select: safeStoreSelect,
      })
    }

    return (this.prisma as any).doudianStore.create({
      data: {
        name,
        profilePath,
        sessionStatus: 'managed_by_companion',
      },
      select: safeStoreSelect,
    })
  }

  async deleteStore(id: string) {
    return (this.prisma as any).doudianStore.delete({ where: { id }, select: safeStoreSelect })
  }

  async syncAllStores() {
    if (this.syncRunning) return { skipped: true, reason: 'sync already running' }
    this.syncRunning = true

    const stores = await (this.prisma as any).doudianStore.findMany({
      where: { status: AccountStatus.ACTIVE },
      select: { id: true, name: true, profilePath: true },
      orderBy: { createdAt: 'asc' },
    })

    let success = 0
    let failed = 0
    const errors: Array<{ storeId: string; message: string }> = []

    try {
      for (const store of stores) {
        if (String(store.profilePath || '').startsWith('companion:')) {
          this.logger.log(`Skip companion-managed Doudian store [${store.name}] in server sync`)
          continue
        }
        try {
          await this.syncStore(store.id)
          success++
          await this.sleep(30_000)
        } catch (error: any) {
          failed++
          errors.push({ storeId: store.id, message: error.message })
          this.logger.warn(`Doudian sync failed [${store.name}]: ${error.message}`)
        }
      }
    } finally {
      this.syncRunning = false
    }

    return { skipped: false, total: stores.length, success, failed, errors }
  }

  async syncStore(storeId: string) {
    const store = await (this.prisma as any).doudianStore.findUnique({ where: { id: storeId } })
    if (!store) throw new Error(`Doudian store not found: ${storeId}`)
    if (String(store.profilePath || '').startsWith('companion:')) {
      throw new Error(
        'This Doudian store is managed by desktop companion. Please sync from the local companion.',
      )
    }

    const syncedAt = new Date()
    await (this.prisma as any).doudianStore.update({
      where: { id: storeId },
      data: { syncStatus: 'syncing', syncError: null },
    })

    let context: BrowserContext | undefined
    try {
      context = await this.launchContext(store.profilePath, true)
      const page = await this.getPage(context)
      const captured = await this.collectData(page)
      this.assertLoggedIn(captured)

      const productsSaved = await this.saveProducts(storeId, captured.products, syncedAt)
      const ordersSaved = await this.saveOrders(storeId, captured.orders, syncedAt)
      const aftersalesSaved = await this.saveAftersales(storeId, captured.aftersales, syncedAt)

      await (this.prisma as any).doudianStore.update({
        where: { id: storeId },
        data: {
          lastSyncedAt: new Date(),
          syncStatus: 'ok',
          syncError: null,
          sessionStatus: 'ok',
        },
      })

      return { ordersSaved, productsSaved, aftersalesSaved }
    } catch (error: any) {
      const message = String(error?.message || error).slice(0, 1000)
      await (this.prisma as any).doudianStore.update({
        where: { id: storeId },
        data: {
          syncStatus: 'failed',
          syncError: message,
          ...(message.includes('login') || message.includes('登录')
            ? { sessionStatus: 'login_required' }
            : {}),
        },
      })
      throw error
    } finally {
      await context?.close().catch(() => undefined)
    }
  }

  async uploadCompanionData(
    storeId: string,
    payload: {
      orders?: any
      products?: any
      aftersales?: any
      storeName?: string
      localProfileId?: string
    },
  ) {
    const store = await (this.prisma as any).doudianStore.findUnique({ where: { id: storeId } })
    if (!store) throw new Error(`Doudian store not found: ${storeId}`)
    const expectedProfilePath = `companion:${payload.localProfileId || ''}`
    if (!payload.localProfileId || store.profilePath !== expectedProfilePath) {
      throw new Error('Invalid companion upload store binding')
    }

    const syncedAt = new Date()
    const productsSaved = await this.saveProducts(storeId, payload.products, syncedAt)
    const ordersSaved = await this.saveOrders(storeId, payload.orders, syncedAt)
    const aftersalesSaved = await this.saveAftersales(storeId, payload.aftersales, syncedAt)

    await (this.prisma as any).doudianStore.update({
      where: { id: storeId },
      data: {
        ...(payload.storeName ? { name: payload.storeName } : {}),
        lastSyncedAt: syncedAt,
        syncStatus: 'ok',
        syncError: null,
        sessionStatus: 'managed_by_companion',
      },
    })

    return { ordersSaved, productsSaved, aftersalesSaved }
  }

  async openLoginWindow(storeId: string) {
    const store = await (this.prisma as any).doudianStore.findUnique({ where: { id: storeId } })
    if (!store) throw new Error(`Doudian store not found: ${storeId}`)

    const context = await this.launchContext(store.profilePath, false)
    const page = await this.getPage(context)
    await page.goto('https://fxg.jinritemai.com/ffa/mshop/homepage/index', {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    })
  }

  async checkSession(storeId: string) {
    const store = await (this.prisma as any).doudianStore.findUnique({ where: { id: storeId } })
    if (!store) throw new Error(`Doudian store not found: ${storeId}`)

    let context: BrowserContext | undefined
    try {
      context = await this.launchContext(store.profilePath, true)
      const page = await this.getPage(context)
      await page.goto('https://fxg.jinritemai.com/ffa/mshop/homepage/index', {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      })
      await page.waitForTimeout(8_000)
      const loggedIn = await this.isLoggedIn(page)
      await (this.prisma as any).doudianStore.update({
        where: { id: storeId },
        data: { sessionStatus: loggedIn ? 'ok' : 'login_required' },
      })
      return { loggedIn, url: page.url(), title: await page.title().catch(() => '') }
    } finally {
      await context?.close().catch(() => undefined)
    }
  }

  async getOrders(storeId: string, params: OrderListQuery = {}) {
    const hasRange = params.start_time !== undefined || params.end_time !== undefined
    const where: any = { storeId }
    if (hasRange) {
      where.createTime = {
        ...(params.start_time !== undefined && { gte: params.start_time }),
        ...(params.end_time !== undefined && { lte: params.end_time }),
      }
    }

    const rows = await (this.prisma as any).doudianStoreOrder.findMany({
      where,
      orderBy: { createTime: 'desc' },
      ...(hasRange ? {} : { take: 1000 }),
    })
    return {
      errcode: 0,
      errmsg: 'ok',
      order_list: rows.map((row: any) => ({
        order_id: row.orderId,
        status: row.status,
        status_text:
          row.raw?.order_status_text || row.raw?.order_status_info?.order_status_text || '',
        pay_amount: row.payAmount,
        post_amount: row.postAmount,
        product_count: row.productCount,
        create_time: row.createTime,
        update_time: row.updateTime,
        product_title: row.productTitle,
        product_img: row.productImg,
      })),
      total_num: rows.length,
      cached: true,
    }
  }

  async getProducts(storeId: string) {
    const rows = await (this.prisma as any).doudianStoreProduct.findMany({
      where: { storeId },
      orderBy: [{ sales: 'desc' }, { updatedAt: 'desc' }],
      take: 1000,
    })
    return {
      errcode: 0,
      errmsg: 'ok',
      products: rows.map((row: any) => ({
        product_id: row.productId,
        title: row.title,
        img_url: row.imgUrl,
        selling_price: row.minPrice,
        min_price: row.minPrice,
        max_price: row.maxPrice,
        sales: row.sales,
        stock: row.stock,
        status: row.status,
      })),
      total_num: rows.length,
      cached: true,
    }
  }

  async getAftersales(storeId: string, params: AftersaleListQuery = {}) {
    const hasRange = params.begin_create_time !== undefined || params.end_create_time !== undefined
    const where: any = { storeId }
    if (hasRange) {
      const timeRange = {
        ...(params.begin_create_time !== undefined && { gte: params.begin_create_time }),
        ...(params.end_create_time !== undefined && { lte: params.end_create_time }),
      }
      where.OR = [{ createTime: timeRange }, { updateTime: timeRange }]
    }

    const rows = await (this.prisma as any).doudianStoreAftersale.findMany({
      where,
      orderBy: { createTime: 'desc' },
      ...(hasRange ? {} : { take: 1000 }),
    })
    const list = rows.map((row: any) => ({
      id: row.afterSaleId,
      order_id: row.orderId,
      type: row.type,
      status: row.status,
      status_text:
        row.raw?.after_sale_info?.after_sale_status_text ||
        row.raw?.text_part?.after_sale_status_text ||
        '',
      type_text:
        row.raw?.after_sale_info?.after_sale_type_text ||
        row.raw?.text_part?.after_sale_type_text ||
        '',
      reason: row.raw?.after_sale_info?.reason_text || row.raw?.text_part?.reason_text || '',
      amount: row.amount,
      product: row.product,
      product_id: row.productId,
      create_time: row.createTime,
      update_time: row.updateTime,
    }))
    return {
      errcode: 0,
      errmsg: 'ok',
      list,
      total: list.length,
      totalAmount: list.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
      cached: true,
    }
  }

  async getSummary(storeId: string, start: number, end: number, mode: DoudianViewMode) {
    const normalizedMode: DoudianViewMode = ['today', 'yesterday', 'week', 'month'].includes(mode)
      ? mode
      : 'today'
    const range = {
      start: Number(start || 0),
      end: Number(end || 0),
    }
    if (!storeId || !range.start || !range.end || range.end < range.start) {
      throw new Error('Invalid Doudian summary query')
    }

    const [orderRows, aftersaleRows] = await Promise.all([
      (this.prisma as any).doudianStoreOrder.findMany({
        where: { storeId },
        orderBy: { createTime: 'desc' },
      }),
      (this.prisma as any).doudianStoreAftersale.findMany({
        where: { storeId },
        orderBy: { updateTime: 'desc' },
      }),
    ])

    const orders: DoudianOrderMetric[] = orderRows.map((row: any) => ({
      order_id: row.orderId,
      status: row.status,
      status_text:
        row.raw?.order_status_text || row.raw?.order_status_info?.order_status_text || '',
      pay_amount: row.payAmount,
      create_time: row.createTime,
    }))
    const aftersales: DoudianAftersaleMetric[] = aftersaleRows.map((row: any) => ({
      id: row.afterSaleId,
      order_id: row.orderId,
      status: row.status,
      status_text:
        row.raw?.after_sale_info?.after_sale_status_text ||
        row.raw?.text_part?.after_sale_status_text ||
        '',
      amount: row.amount,
      create_time: row.createTime,
      update_time: row.updateTime,
    }))

    return {
      errcode: 0,
      errmsg: 'ok',
      cached: true,
      ...buildDoudianSummary(orders, aftersales, range, normalizedMode),
    }
  }

  private async collectData(page: Page): Promise<CapturedData> {
    const captured: CapturedData = {}
    // Buffer raw response texts to avoid Protocol error when the page
    // navigates before response.json() can read the body.
    const rawBuffer: Array<{ endpoint: CapturedEndpoint; text: string }> = []

    page.on('response', async (response: any) => {
      const url = response.url()
      const contentType = response.headers()['content-type'] || ''
      if (!url.includes('jinritemai.com') || !contentType.includes('json')) return
      const endpoint = this.classifyEndpoint(url)
      if (!endpoint) return

      try {
        const text = await response.text()
        rawBuffer.push({ endpoint, text })
      } catch {
        // Response body unavailable — skip.
      }
    })

    await this.visitAndPaginate(page, 'https://fxg.jinritemai.com/ffa/morder/order/list')
    await this.visitAndPaginate(
      page,
      'https://fxg.jinritemai.com/ffa/g/list?sov_draft_status=0&sov_goodsType=0',
    )
    await this.visitAndPaginate(page, 'https://fxg.jinritemai.com/ffa/maftersale/aftersale/list')

    // Parse buffered responses AFTER all navigation is done.
    for (const { endpoint, text } of rawBuffer) {
      try {
        const json = JSON.parse(text)
        this.mergeCaptured(captured, endpoint, json)
      } catch {
        // Ignore non-parseable JSON.
      }
    }

    return captured
  }

  private async visitAndPaginate(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    try {
      await page.waitForLoadState('networkidle', { timeout: 20_000 })
    } catch {
      // networkidle timeout is acceptable
    }
    await page.waitForTimeout(5_000)

    for (let pageNo = 1; pageNo < MAX_PAGINATION_PAGES; pageNo++) {
      const clicked = await this.clickNextPage(page)
      if (!clicked) break
      try {
        await page.waitForLoadState('networkidle', { timeout: 15_000 })
      } catch {
        // networkidle timeout is acceptable
      }
      await page.waitForTimeout(5_000)
    }
  }

  private async clickNextPage(page: Page) {
    return page
      .evaluate(() => {
        const selectors = [
          '.el-pagination .btn-next',
          '.auxo-pagination-next',
          '.semi-page-next',
          '[aria-label*="下一"]',
          '[title*="下一"]',
        ]

        const bySelector = selectors
          .map((selector) => document.querySelector(selector) as HTMLElement | null)
          .find(Boolean)

        const textCandidates = Array.from(
          document.querySelectorAll('button, a, li'),
        ) as HTMLElement[]
        const byText = textCandidates.find((element) => {
          const text = (element.innerText || element.textContent || '').trim()
          const aria = element.getAttribute('aria-label') || ''
          const title = element.getAttribute('title') || ''
          return /下一页|下一|Next/i.test(`${text} ${aria} ${title}`)
        })

        const target = bySelector || byText
        if (!target) return false

        const className = target.className?.toString() || ''
        const disabled =
          target.hasAttribute('disabled') ||
          target.getAttribute('aria-disabled') === 'true' ||
          className.includes('disabled') ||
          className.includes('is-disabled')

        if (disabled) return false
        target.click()
        return true
      })
      .catch(() => false)
  }

  private classifyEndpoint(url: string) {
    const pathname = new URL(url).pathname
    if (pathname === '/api/order/searchlist') return 'orders'
    if (pathname === '/api/order/tabcnt') return 'orderCounts'
    if (pathname === '/product/tproduct/list') return 'products'
    if (pathname === '/product/tproduct/aggsProductCount') return 'productCounts'
    if (pathname === '/after_sale/pc/list') return 'aftersales'
    if (pathname === '/shopuser/aftersale/counts') return 'aftersaleCounts'
    return null
  }

  private mergeCaptured(captured: CapturedData, endpoint: CapturedEndpoint, payload: any) {
    if (endpoint === 'orders')
      captured.orders = this.mergeListPayload(captured.orders, payload, 'orders')
    if (endpoint === 'products')
      captured.products = this.mergeListPayload(captured.products, payload, 'products')
    if (endpoint === 'aftersales') {
      captured.aftersales = this.mergeListPayload(captured.aftersales, payload, 'aftersales')
    }
    if (endpoint === 'orderCounts') captured.orderCounts = payload
    if (endpoint === 'productCounts') captured.productCounts = payload
    if (endpoint === 'aftersaleCounts') captured.aftersaleCounts = payload
  }

  private mergeListPayload(
    current: any,
    incoming: any,
    endpoint: 'orders' | 'products' | 'aftersales',
  ) {
    if (!current) return incoming

    const currentItems = this.getPayloadItems(current, endpoint)
    const incomingItems = this.getPayloadItems(incoming, endpoint)
    if (!incomingItems.length) return current

    const merged = new Map<string, any>()
    for (const item of currentItems) merged.set(this.getPayloadItemKey(item, endpoint), item)
    for (const item of incomingItems) merged.set(this.getPayloadItemKey(item, endpoint), item)

    if (endpoint === 'aftersales') {
      return {
        ...current,
        data: {
          ...(current.data || {}),
          items: Array.from(merged.values()),
        },
      }
    }

    return {
      ...current,
      data: Array.from(merged.values()),
    }
  }

  private getPayloadItems(payload: any, endpoint: 'orders' | 'products' | 'aftersales') {
    if (endpoint === 'aftersales')
      return Array.isArray(payload?.data?.items) ? payload.data.items : []
    return Array.isArray(payload?.data) ? payload.data : []
  }

  private getPayloadItemKey(item: any, endpoint: 'orders' | 'products' | 'aftersales') {
    if (endpoint === 'orders')
      return String(item.shop_order_id || item.order_id || JSON.stringify(item))
    if (endpoint === 'products') return String(item.product_id || JSON.stringify(item))
    return String(item.after_sale_info?.after_sale_id || item.id || JSON.stringify(item))
  }

  private assertLoggedIn(captured: CapturedData) {
    const hasBusinessData = captured.orders || captured.products || captured.aftersales
    if (!hasBusinessData)
      throw new Error('Doudian login required or business endpoints not captured')
    for (const data of [captured.orders, captured.products, captured.aftersales]) {
      if (data && (data.code === 10008 || data.st === 10008 || data.msg?.includes('未登录'))) {
        throw new Error('Doudian login required')
      }
    }
  }

  private async isLoggedIn(page: Page) {
    await page.waitForTimeout(3_000)
    const text = await page
      .locator('body')
      .innerText({ timeout: 5_000 })
      .catch(() => '')
    return (
      !page.url().includes('/login/') &&
      !/手机登录|邮箱登录|发送验证码/.test(text) &&
      /抖店|订单|商品|售后|经营/.test(text)
    )
  }

  private async saveOrders(storeId: string, payload: any, syncedAt: Date) {
    const orders: any[] = Array.isArray(payload?.data) ? payload.data : []
    let saved = 0
    for (const order of orders) {
      const orderId = String(order.shop_order_id || order.order_id || '')
      if (!orderId) continue
      const product =
        order.product_item?.[0] || order.product_item_list?.[0] || order.sku_order_list?.[0] || {}
      await (this.prisma as any).doudianStoreOrder.upsert({
        where: { storeId_orderId: { storeId, orderId } },
        update: {
          status: Number(order.order_status ?? 0),
          payAmount: Number(order.pay_amount ?? order.total_pay_amount ?? 0),
          postAmount: Number(order.post_amount ?? order.total_post_amount ?? 0),
          productCount: Number(order.product_count ?? 0),
          createTime: Number(order.create_time ?? 0),
          updateTime: Number(order.update_time ?? 0),
          productTitle: product.product_name || product.name || '',
          productImg: product.product_pic || product.img || '',
          raw: order,
          syncedAt,
        },
        create: {
          storeId,
          orderId,
          status: Number(order.order_status ?? 0),
          payAmount: Number(order.pay_amount ?? order.total_pay_amount ?? 0),
          postAmount: Number(order.post_amount ?? order.total_post_amount ?? 0),
          productCount: Number(order.product_count ?? 0),
          createTime: Number(order.create_time ?? 0),
          updateTime: Number(order.update_time ?? 0),
          productTitle: product.product_name || product.name || '',
          productImg: product.product_pic || product.img || '',
          raw: order,
          syncedAt,
        },
      })
      saved++
    }
    return saved
  }

  private async saveProducts(storeId: string, payload: any, syncedAt: Date) {
    const products: any[] = Array.isArray(payload?.data) ? payload.data : []
    let saved = 0
    for (const product of products) {
      const productId = String(product.product_id || '')
      if (!productId) continue
      await (this.prisma as any).doudianStoreProduct.upsert({
        where: { storeId_productId: { storeId, productId } },
        update: {
          title: product.name || '',
          imgUrl: product.img || '',
          minPrice: Number(product.price_lower ?? product.discount_price ?? 0),
          maxPrice: Number(product.price_higher ?? product.discount_price ?? 0),
          sales: Number(product.sell_num ?? 0),
          stock: Number(product.stock_num ?? product.stock ?? 0),
          status: Number(product.status ?? 0),
          raw: product,
          syncedAt,
        },
        create: {
          storeId,
          productId,
          title: product.name || '',
          imgUrl: product.img || '',
          minPrice: Number(product.price_lower ?? product.discount_price ?? 0),
          maxPrice: Number(product.price_higher ?? product.discount_price ?? 0),
          sales: Number(product.sell_num ?? 0),
          stock: Number(product.stock_num ?? product.stock ?? 0),
          status: Number(product.status ?? 0),
          raw: product,
          syncedAt,
        },
      })
      saved++
    }
    return saved
  }

  private async saveAftersales(storeId: string, payload: any, syncedAt: Date) {
    const items: any[] = Array.isArray(payload?.data?.items) ? payload.data.items : []
    let saved = 0
    for (const item of items) {
      const info = item.after_sale_info || {}
      const order = item.order_info || {}
      const product = order.product_info || order.product || item.product_info || {}
      const afterSaleId = String(info.after_sale_id || '')
      if (!afterSaleId) continue
      await (this.prisma as any).doudianStoreAftersale.upsert({
        where: { storeId_afterSaleId: { storeId, afterSaleId } },
        update: {
          orderId: String(info.related_id ?? order.order_id ?? ''),
          type: Number(info.after_sale_type ?? 0),
          status: Number(info.after_sale_status ?? 0),
          amount: Number(info.refund_amount ?? 0),
          product: product.product_name || product.name || '',
          productId: product.product_id ? String(product.product_id) : null,
          createTime: Number(info.create_time ?? info.apply_time ?? 0),
          updateTime: Number(info.update_time ?? 0),
          raw: item,
          syncedAt,
        },
        create: {
          storeId,
          afterSaleId,
          orderId: String(info.related_id ?? order.order_id ?? ''),
          type: Number(info.after_sale_type ?? 0),
          status: Number(info.after_sale_status ?? 0),
          amount: Number(info.refund_amount ?? 0),
          product: product.product_name || product.name || '',
          productId: product.product_id ? String(product.product_id) : null,
          createTime: Number(info.create_time ?? info.apply_time ?? 0),
          updateTime: Number(info.update_time ?? 0),
          raw: item,
          syncedAt,
        },
      })
      saved++
    }
    return saved
  }

  private async launchContext(profilePath: string, headless: boolean) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chromium } = require('playwright')
    fs.mkdirSync(profilePath, { recursive: true })
    return chromium.launchPersistentContext(profilePath, {
      headless,
      viewport: { width: 1365, height: 900 },
      locale: 'zh-CN',
      args: ['--disable-blink-features=AutomationControlled'],
    })
  }

  private async getPage(context: BrowserContext) {
    return context.pages()[0] || (await context.newPage())
  }

  private resolveProfilePath(profilePath: string) {
    return path.isAbsolute(profilePath) ? profilePath : path.resolve(process.cwd(), profilePath)
  }

  private safeProfileName(name: string) {
    return name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || `store-${Date.now()}`
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
