import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common'
import { AccountStatus, UserRole } from '@prisma/client'
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
const DOUDIAN_SAVE_BATCH_SIZE = 20

function isLoginExpiredPayload(data: any) {
  if (!data || typeof data !== 'object') return false
  const code = String(data.code ?? data.st ?? '')
  const msg = String(data.msg ?? data.message ?? '')
  return (
    code === '10008' ||
    msg.includes('登录信息已失效') ||
    msg.includes('请重新登录') ||
    msg.toLowerCase().includes('login')
  )
}

function textValue(value: any) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'string') return value.trim()
  return ''
}

function normalizeStoreName(value: any) {
  return String(value || '').trim().replace(/\s+/g, '').toLowerCase()
}

function findNestedText(obj: any, keyTokens: string[], valueHints: string[] = []): string {
  if (!obj) return ''
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findNestedText(item, keyTokens, valueHints)
      if (found) return found
    }
    return ''
  }
  if (typeof obj !== 'object') return ''

  for (const [key, value] of Object.entries(obj)) {
    const keyText = String(key).toLowerCase()
    const valueText = textValue(value)
    if (valueText && keyTokens.some((token) => keyText.includes(token))) return valueText
    if (valueText && valueHints.some((token) => valueText.includes(token))) return valueText
  }

  for (const value of Object.values(obj)) {
    const found = findNestedText(value, keyTokens, valueHints)
    if (found) return found
  }
  return ''
}

export function extractDoudianAuthor(raw: any) {
  return {
    author_name:
      textValue(raw?.author_name) ||
      findNestedText(raw, [
        'author_name',
        'author_nick',
        'creator_name',
        'creator_nick',
        'kol_name',
        'talent_name',
        'talent_nick',
        'promoter_name',
        'promotion_name',
        'affiliate_name',
        'author_account',
        'talent_account',
        'promoter_account',
        '达人',
        '带货',
      ]),
    author_id:
      textValue(raw?.author_id) ||
      findNestedText(raw, [
        'author_id',
        'creator_id',
        'kol_id',
        'talent_id',
        'promoter_id',
        'promotion_id',
        'affiliate_id',
        'author_account',
        'talent_account',
        'promoter_account',
        '达人id',
        '达人_id',
      ]),
    author_source:
      textValue(raw?.author_source) ||
      findNestedText(
        raw,
        ['traffic_source', 'source_type', 'promotion_type', 'affiliate_type', 'origin', 'channel', '联盟'],
        ['精选联盟', '短视频', '直播'],
      ),
  }
}

@Injectable()
export class DoudianBrowserService implements OnModuleInit {
  private readonly logger = new Logger(DoudianBrowserService.name)
  private syncRunning = false

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('DoudianBrowserService initialized')
  }

  async assertStoreAccess(storeId: string, user?: { role?: UserRole; organizationId?: string | null }) {
    if (!storeId) throw new BadRequestException('store_id is required')
    const store = await (this.prisma as any).doudianStore.findUnique({
      where: { id: storeId },
      select: { organizationId: true },
    })
    if (!store) {
      // 结构化 404：伴侣本地保存的 cloud_store_id 已失效（云端店铺被重建）时，
      // 伴侣可识别 DOUDIAN_STORE_NOT_FOUND 并按店名自动找回、重绑，而不是死循环报错。
      throw new NotFoundException({
        code: 'DOUDIAN_STORE_NOT_FOUND',
        message: '云端抖店店铺不存在，请重新绑定后同步。',
      })
    }
    if (user?.role === UserRole.SUPER_ADMIN) return
    if (store.organizationId && user?.organizationId === store.organizationId) return
    if (!store.organizationId && !user?.organizationId) return
    throw new ForbiddenException('No access to this store')
  }

  private async getStoreOrganizationId(storeId: string) {
    const store = await (this.prisma as any).doudianStore.findUnique({
      where: { id: storeId },
      select: { organizationId: true },
    })
    if (!store) throw new Error(`Doudian store not found: ${storeId}`)
    return store.organizationId || null
  }

  private storeTenantWhere(storeId: string, organizationId: string | null) {
    return { storeId, organizationId }
  }

  async getStores(user?: { role?: UserRole; organizationId?: string | null }) {
    return (this.prisma as any).doudianStore.findMany({
      where: user?.role === UserRole.SUPER_ADMIN ? {} : { organizationId: user?.organizationId || null },
      orderBy: { createdAt: 'asc' },
      select: safeStoreSelect,
    })
  }

  async createStore(name: string, profilePath?: string, user?: { organizationId?: string | null }) {
    const normalizedProfilePath = this.resolveProfilePath(
      profilePath || path.join(DEFAULT_PROFILE_ROOT, this.safeProfileName(name)),
    )
    fs.mkdirSync(normalizedProfilePath, { recursive: true })

    return (this.prisma as any).doudianStore.create({
      data: { name, profilePath: normalizedProfilePath, organizationId: user?.organizationId || null },
      select: safeStoreSelect,
    })
  }

  async createCompanionStore(name: string, localProfileId?: string, user?: { organizationId?: string | null }) {
    const profilePath = `companion:${localProfileId || this.safeProfileName(name)}`
    const existing = await (this.prisma as any).doudianStore.findUnique({
      where: { profilePath },
      select: safeStoreSelect,
    })
    if (existing) {
      return (this.prisma as any).doudianStore.update({
        where: { id: existing.id },
        data: { name, status: AccountStatus.ACTIVE, organizationId: user?.organizationId || null },
        select: safeStoreSelect,
      })
    }

    return (this.prisma as any).doudianStore.create({
      data: {
        name,
        profilePath,
        sessionStatus: 'managed_by_companion',
        organizationId: user?.organizationId || null,
      },
      select: safeStoreSelect,
    })
  }

  async deleteStore(id: string, user?: { role?: UserRole; organizationId?: string | null }) {
    await this.assertStoreAccess(id, user)
    return (this.prisma as any).doudianStore.delete({ where: { id }, select: safeStoreSelect })
  }

  async updateStoreName(id: string, name?: string, user?: { role?: UserRole; organizationId?: string | null }) {
    await this.assertStoreAccess(id, user)
    const trimmed = String(name || '').trim()
    if (!trimmed) return { updated: false }
    await (this.prisma as any).doudianStore.update({
      where: { id },
      data: { name: trimmed },
    })
    return { updated: true, name: trimmed }
  }

  async rebindCompanionStore(
    id: string,
    body: { localProfileId?: string; storeName?: string },
    user?: { role?: UserRole; organizationId?: string | null },
  ) {
    await this.assertStoreAccess(id, user)
    const localProfileId = String(body.localProfileId || '').trim()
    if (!/^[A-Za-z0-9_-]{3,128}$/.test(localProfileId)) {
      throw new BadRequestException({
        code: 'INVALID_LOCAL_PROFILE_ID',
        message: '披星云伴侣本地店铺标识无效，请刷新伴侣后重试。',
      })
    }

    const store = await (this.prisma as any).doudianStore.findUnique({
      where: { id },
      select: { id: true, name: true, profilePath: true, organizationId: true },
    })
    if (!store) throw new BadRequestException('Doudian store not found')
    if (!String(store.profilePath || '').startsWith('companion:')) {
      throw new BadRequestException({
        code: 'NOT_COMPANION_MANAGED_STORE',
        message: '当前抖店不是披星云伴侣管理的店铺，不能自动重绑。',
      })
    }

    const incomingName = String(body.storeName || '').trim()
    if (incomingName && store.name && normalizeStoreName(incomingName) !== normalizeStoreName(store.name)) {
      throw new ConflictException({
        code: 'DOUDIAN_STORE_NAME_MISMATCH',
        message: '当前登录的抖店名称与网站店铺不一致，为避免绑错店，本次同步已停止。',
      })
    }

    const profilePath = `companion:${localProfileId}`
    const existing = await (this.prisma as any).doudianStore.findUnique({
      where: { profilePath },
      select: { id: true, organizationId: true },
    })
    if (existing && existing.id !== id) {
      throw new ConflictException({
        code: 'DOUDIAN_PROFILE_ALREADY_BOUND',
        message: '当前披星云伴侣本地店铺已经绑定到另一家抖店，请检查店铺后再同步。',
      })
    }

    const updated = await (this.prisma as any).doudianStore.update({
      where: { id },
      data: {
        profilePath,
        ...(incomingName ? { name: incomingName } : {}),
        syncStatus: 'pending',
        syncError: null,
        sessionStatus: 'managed_by_companion',
      },
      select: safeStoreSelect,
    })
    return { success: true, code: 'REBIND_OK', store: updated }
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

  async syncStore(storeId: string, user?: { role?: UserRole; organizationId?: string | null }) {
    if (user) await this.assertStoreAccess(storeId, user)
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

      const organizationId = store.organizationId || null
      const productsSaved = await this.saveProducts(storeId, captured.products, syncedAt, organizationId)
      const ordersSaved = await this.saveOrders(storeId, captured.orders, syncedAt, organizationId)
      const aftersalesSaved = await this.saveAftersales(storeId, captured.aftersales, syncedAt, organizationId)

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
      partial?: boolean
    },
  ) {
    const store = await (this.prisma as any).doudianStore.findUnique({ where: { id: storeId } })
    if (!store) {
      throw new NotFoundException({
        code: 'DOUDIAN_STORE_NOT_FOUND',
        message: '云端抖店店铺不存在，请重新绑定后同步。',
      })
    }
    const expectedProfilePath = `companion:${payload.localProfileId || ''}`
    if (!payload.localProfileId || store.profilePath !== expectedProfilePath) {
      this.logger.warn(
        `Doudian companion binding stale storeId=${storeId} expected=${store.profilePath} received=${expectedProfilePath}`,
      )
      await (this.prisma as any).doudianStore.update({
        where: { id: storeId },
        data: {
          syncStatus: 'failed',
          syncError: '当前店铺与披星云伴侣的绑定信息已失效，请重新绑定后同步。',
        },
      })
      throw new ConflictException({
        code: 'STALE_COMPANION_BINDING',
        message: '当前店铺与披星云伴侣的绑定信息已失效，请重新绑定后同步。',
      })
    }
    // Store name matching removed: account isolation is enforced by
    // profilePath (localProfileId) binding above, not by name comparison.
    // The actual store name is auto-captured from the Doudian page after login.

    this.assertLoggedIn(payload)

    const syncedAt = new Date()
    const organizationId = store.organizationId || null
    const productsSaved = await this.saveProducts(storeId, payload.products, syncedAt, organizationId)
    const ordersSaved = await this.saveOrders(storeId, payload.orders, syncedAt, organizationId)
    const aftersalesSaved = await this.saveAftersales(storeId, payload.aftersales, syncedAt, organizationId)

    if (!payload.partial) {
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
    }

    return { ordersSaved, productsSaved, aftersalesSaved, partial: Boolean(payload.partial) }
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
    const organizationId = await this.getStoreOrganizationId(storeId)
    const hasRange = params.start_time !== undefined || params.end_time !== undefined
    const where: any = this.storeTenantWhere(storeId, organizationId)
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
      order_list: rows.map((row: any) => {
        const author = extractDoudianAuthor(row.raw)
        return {
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
          author_name: author.author_name,
          author_id: author.author_id,
          author_source: author.author_source,
        }
      }),
      total_num: rows.length,
      cached: true,
    }
  }

  async getProducts(storeId: string) {
    const organizationId = await this.getStoreOrganizationId(storeId)
    const rows = await (this.prisma as any).doudianStoreProduct.findMany({
      where: this.storeTenantWhere(storeId, organizationId),
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
    const organizationId = await this.getStoreOrganizationId(storeId)
    const hasRange = params.begin_create_time !== undefined || params.end_create_time !== undefined
    const where: any = this.storeTenantWhere(storeId, organizationId)
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
      totalAmount: list.reduce(
        (sum: number, item: any) => sum + this.toFiniteNumber(item.amount),
        0,
      ),
      cached: true,
    }
  }

  async getSummary(storeId: string, start: number, end: number, mode: DoudianViewMode) {
    const organizationId = await this.getStoreOrganizationId(storeId)
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
        where: this.storeTenantWhere(storeId, organizationId),
        orderBy: { createTime: 'desc' },
      }),
      (this.prisma as any).doudianStoreAftersale.findMany({
        where: this.storeTenantWhere(storeId, organizationId),
        orderBy: { updateTime: 'desc' },
      }),
    ])

    const orders: DoudianOrderMetric[] = orderRows.map((row: any) => {
      const author = extractDoudianAuthor(row.raw)
      return {
        order_id: row.orderId,
        status: row.status,
        status_text:
          row.raw?.order_status_text || row.raw?.order_status_info?.order_status_text || '',
        pay_amount: row.payAmount,
        create_time: row.createTime,
        author_name: author.author_name,
        author_id: author.author_id,
        author_source: author.author_source,
      }
    })
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
    let pathname: string
    try {
      pathname = new URL(url).pathname
    } catch {
      return null
    }
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
      if (isLoginExpiredPayload(data)) {
        throw new Error('Doudian login required')
      }
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

  private async saveOrders(
    storeId: string,
    payload: any,
    syncedAt: Date,
    organizationId: string | null,
  ) {
    const orders: any[] = Array.isArray(payload?.data) ? payload.data : []
    return this.saveInBatches(orders, DOUDIAN_SAVE_BATCH_SIZE, async (order) => {
      const orderId = String(order.shop_order_id || order.order_id || '')
      if (!orderId) return false
      const product =
        order.product_item?.[0] || order.product_item_list?.[0] || order.sku_order_list?.[0] || {}
      const incomingAuthor = extractDoudianAuthor(order)
      if (!incomingAuthor.author_name && !incomingAuthor.author_id) {
        const existing = await (this.prisma as any).doudianStoreOrder.findUnique({
          where: { storeId_orderId: { storeId, orderId } },
          select: { raw: true },
        })
        const existingAuthor = extractDoudianAuthor(existing?.raw)
        if (existingAuthor.author_name || existingAuthor.author_id) {
          order.author_name = existingAuthor.author_name
          order.author_id = existingAuthor.author_id
          order.author_source = existingAuthor.author_source
        }
      }
      await (this.prisma as any).doudianStoreOrder.upsert({
        where: { storeId_orderId: { storeId, orderId } },
        update: {
          organizationId,
          status: this.toFiniteNumber(order.order_status),
          payAmount: this.firstFiniteNumber(order.pay_amount, order.total_pay_amount),
          postAmount: this.firstFiniteNumber(order.post_amount, order.total_post_amount),
          productCount: this.toFiniteNumber(order.product_count),
          createTime: this.toFiniteNumber(order.create_time),
          updateTime: this.toFiniteNumber(order.update_time),
          productTitle: product.product_name || product.name || '',
          productImg: product.product_pic || product.img || '',
          raw: order,
          syncedAt,
        },
        create: {
          storeId,
          organizationId,
          orderId,
          status: this.toFiniteNumber(order.order_status),
          payAmount: this.firstFiniteNumber(order.pay_amount, order.total_pay_amount),
          postAmount: this.firstFiniteNumber(order.post_amount, order.total_post_amount),
          productCount: this.toFiniteNumber(order.product_count),
          createTime: this.toFiniteNumber(order.create_time),
          updateTime: this.toFiniteNumber(order.update_time),
          productTitle: product.product_name || product.name || '',
          productImg: product.product_pic || product.img || '',
          raw: order,
          syncedAt,
        },
      })
      return true
    })
  }

  private async saveProducts(
    storeId: string,
    payload: any,
    syncedAt: Date,
    organizationId: string | null,
  ) {
    const products: any[] = Array.isArray(payload?.data) ? payload.data : []
    return this.saveInBatches(products, DOUDIAN_SAVE_BATCH_SIZE, async (product) => {
      const productId = String(product.product_id || '')
      if (!productId) return false
      await (this.prisma as any).doudianStoreProduct.upsert({
        where: { storeId_productId: { storeId, productId } },
        update: {
          organizationId,
          title: product.name || '',
          imgUrl: product.img || '',
          minPrice: this.firstFiniteNumber(product.price_lower, product.discount_price),
          maxPrice: this.firstFiniteNumber(product.price_higher, product.discount_price),
          sales: this.toFiniteNumber(product.sell_num),
          stock: this.firstFiniteNumber(product.stock_num, product.stock),
          status: this.toFiniteNumber(product.status),
          raw: product,
          syncedAt,
        },
        create: {
          storeId,
          organizationId,
          productId,
          title: product.name || '',
          imgUrl: product.img || '',
          minPrice: this.firstFiniteNumber(product.price_lower, product.discount_price),
          maxPrice: this.firstFiniteNumber(product.price_higher, product.discount_price),
          sales: this.toFiniteNumber(product.sell_num),
          stock: this.firstFiniteNumber(product.stock_num, product.stock),
          status: this.toFiniteNumber(product.status),
          raw: product,
          syncedAt,
        },
      })
      return true
    })
  }

  private async saveAftersales(
    storeId: string,
    payload: any,
    syncedAt: Date,
    organizationId: string | null,
  ) {
    const items: any[] = Array.isArray(payload?.data?.items) ? payload.data.items : []
    return this.saveInBatches(items, DOUDIAN_SAVE_BATCH_SIZE, async (item) => {
      const info = item.after_sale_info || {}
      const order = item.order_info || {}
      const product = order.product_info || order.product || item.product_info || {}
      const afterSaleId = String(info.after_sale_id || '')
      if (!afterSaleId) return false
      await (this.prisma as any).doudianStoreAftersale.upsert({
        where: { storeId_afterSaleId: { storeId, afterSaleId } },
        update: {
          organizationId,
          orderId: String(info.related_id ?? order.order_id ?? ''),
          type: this.toFiniteNumber(info.after_sale_type),
          status: this.toFiniteNumber(info.after_sale_status),
          amount: this.toFiniteNumber(info.refund_amount),
          product: product.product_name || product.name || '',
          productId: product.product_id ? String(product.product_id) : null,
          createTime: this.firstFiniteNumber(info.create_time, info.apply_time),
          updateTime: this.toFiniteNumber(info.update_time),
          raw: item,
          syncedAt,
        },
        create: {
          storeId,
          organizationId,
          afterSaleId,
          orderId: String(info.related_id ?? order.order_id ?? ''),
          type: this.toFiniteNumber(info.after_sale_type),
          status: this.toFiniteNumber(info.after_sale_status),
          amount: this.toFiniteNumber(info.refund_amount),
          product: product.product_name || product.name || '',
          productId: product.product_id ? String(product.product_id) : null,
          createTime: this.firstFiniteNumber(info.create_time, info.apply_time),
          updateTime: this.toFiniteNumber(info.update_time),
          raw: item,
          syncedAt,
        },
      })
      return true
    })
  }

  private async saveInBatches<T>(
    items: T[],
    batchSize: number,
    saveItem: (item: T) => Promise<boolean>,
  ) {
    let saved = 0
    for (let index = 0; index < items.length; index += batchSize) {
      const batch = items.slice(index, index + batchSize)
      const results = await Promise.all(batch.map((item) => saveItem(item)))
      saved += results.filter(Boolean).length
    }
    return saved
  }

  private toFiniteNumber(value: unknown, fallback = 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  private firstFiniteNumber(...values: unknown[]) {
    for (const value of values) {
      if (value === undefined || value === null) continue
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return 0
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
