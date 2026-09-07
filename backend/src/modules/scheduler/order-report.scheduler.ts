import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationType } from '../../common/prisma-enums'
import { PrismaService } from '../../prisma/prisma.service'
import {
  buildDoudianSummary,
  DoudianAftersaleMetric,
  DoudianOrderMetric,
  filterDoudianRefunds,
  getDoudianRevenueOrders,
  getDoudianSuccessfulRefundOrderIds,
} from '../doudian-browser/doudian-store-metrics'
import {
  DoudianBrowserService,
  extractDoudianAuthor,
} from '../doudian-browser/doudian-browser.service'
import { NotificationsService } from '../notifications/notifications.service'
import { WechatStoreService } from '../wechat-store/wechat-store.service'

interface StoreOrderSummary {
  storeName: string
  totalOrderCount: number
  orderCount: number
  totalAmount: number
  refundCount: number
  refundAmount: number
  sources: OrderSourceSummary[]
}

interface OrderSourceSummary {
  name: string
  channel: string
  orderCount: number
  totalAmount: number
  refundCount: number
  refundAmount: number
}

const WECHAT_NON_REVENUE_STATUSES = new Set([10, 12, 250])
const WECHAT_SUCCESSFUL_REFUND_STATUS = 'MERCHANT_REFUND_SUCCESS'
const ADMIN_ROLES = ['ADMIN', 'OWNER', 'SUPER_ADMIN'] as const
@Injectable()
export class OrderReportScheduler {
  private readonly logger = new Logger(OrderReportScheduler.name)
  private readonly beijingOffsetMs = 8 * 60 * 60 * 1000
  private lastPreReportSyncDateLabel: string | null = null

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private wechatStoreService: WechatStoreService,
    private doudianBrowserService: DoudianBrowserService,
  ) {}

  @Cron('30 8 * * *', { timeZone: 'Asia/Shanghai' })
  async handlePreReportSync() {
    const { dateLabel } = this.getYesterdayRange()
    await this.runPreReportSync(dateLabel)
  }

  @Cron('0 9 * * *', { timeZone: 'Asia/Shanghai' })
  async handleDailyOrderReport() {
    this.logger.log('开始生成每日订单报告...')

    try {
      const { start, end, dateLabel } = this.getYesterdayRange()
      await this.ensurePreReportSync(dateLabel)

      const organizationIds = await this.getActiveStoreOrganizationIds()
      let pushedCount = 0

      if (organizationIds.length === 0) {
        this.logger.log('没有活跃店铺，跳过订单报告推送')
        return
      }

      for (const organizationId of organizationIds) {
        const [wechatSummaries, doudianSummaries] = await Promise.all([
          this.collectWechatStoreSummaries(start, end, organizationId),
          this.collectDoudianStoreSummaries(start, end, organizationId),
        ])

        const hasData =
          wechatSummaries.some((s) => s.orderCount > 0 || s.refundCount > 0) ||
          doudianSummaries.some((s) => s.orderCount > 0 || s.refundCount > 0)

        if (!hasData) continue

        const userIds = await this.getAdminUserIds(organizationId)
        if (userIds.length === 0) {
          this.logger.warn(`组织 ${organizationId || 'default'} 没有可接收订单报告的用户`)
          continue
        }

        const content = this.buildReportContent(dateLabel, wechatSummaries, doudianSummaries)
        let pushedFeishuForReport = false
        for (const userId of userIds) {
          await this.notificationsService.create({
            userId,
            organizationId,
            type: NotificationType.REPORT,
            title: `📊 昨日订单汇总（${dateLabel}）`,
            content,
            metadata: {
              reportType: 'daily_orders',
              date: dateLabel,
              organizationId,
              wechatStores: wechatSummaries,
              doudianStores: doudianSummaries,
            },
            pushFeishu: !pushedFeishuForReport,
          })
          pushedFeishuForReport = true
          pushedCount++
        }
      }

      if (pushedCount === 0) {
        this.logger.log('昨日无订单数据，跳过推送')
        return
      }

      this.logger.log(`订单报告已推送 ${pushedCount} 次`)
    } catch (error: any) {
      this.logger.error(`订单报告生成失败: ${error.message}`, error.stack)
    }
  }

  async triggerManually(): Promise<{ pushed: boolean; message: string }> {
    this.logger.log('手动触发订单报告...')
    try {
      await this.handleDailyOrderReport()
      return { pushed: true, message: '订单报告已推送' }
    } catch (error: any) {
      return { pushed: false, message: error.message }
    }
  }

  private async ensurePreReportSync(dateLabel: string) {
    if (this.lastPreReportSyncDateLabel === dateLabel) return
    await this.runPreReportSync(dateLabel)
  }

  private async runPreReportSync(dateLabel: string) {
    this.logger.log(`开始日报发送前采集: ${dateLabel}`)
    const results = await Promise.allSettled([
      this.wechatStoreService.syncAllStores(),
      this.doudianBrowserService.syncAllStores(),
    ])

    const failures = results
      .map((result, index) => ({ result, platform: index === 0 ? 'wechat' : 'doudian' }))
      .filter(({ result }) => result.status === 'rejected')

    if (failures.length > 0) {
      for (const failure of failures) {
        const reason =
          failure.result.status === 'rejected' && failure.result.reason instanceof Error
            ? failure.result.reason.message
            : String(failure.result.status === 'rejected' ? failure.result.reason : '')
        this.logger.warn(`日报发送前采集失败 [${failure.platform}]: ${reason}`)
      }
      return
    }

    this.lastPreReportSyncDateLabel = dateLabel
    this.logger.log(`日报发送前采集完成: ${dateLabel}`)
  }

  private getYesterdayRange() {
    const beijingNow = new Date(Date.now() + this.beijingOffsetMs)
    const beijingYesterday = new Date(
      Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate() - 1) -
        this.beijingOffsetMs,
    )
    const beijingToday = new Date(
      Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate()) -
        this.beijingOffsetMs,
    )

    const start = Math.floor(beijingYesterday.getTime() / 1000)
    const end = Math.floor(beijingToday.getTime() / 1000) - 1
    const labelDate = new Date(
      Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate() - 1),
    )
    const dateLabel = `${labelDate.getUTCFullYear()}-${String(labelDate.getUTCMonth() + 1).padStart(2, '0')}-${String(labelDate.getUTCDate()).padStart(2, '0')}`

    return { start, end, dateLabel }
  }

  private async collectWechatStoreSummaries(
    startSec: number,
    endSec: number,
    organizationId: string | null,
  ): Promise<StoreOrderSummary[]> {
    const stores = await this.prisma.wechatStore.findMany({
      where: { status: 'ACTIVE', organizationId },
      select: { id: true, name: true },
    })

    const summaries: StoreOrderSummary[] = []

    for (const store of stores) {
      const sourceRefundEndSec = Math.max(endSec, Math.floor(Date.now() / 1000))
      const [orders, aftersales, sourceAftersales] = await Promise.all([
        this.prisma.wechatStoreOrder.findMany({
          where: { storeId: store.id, createTime: { gte: startSec, lte: endSec } },
          select: { orderId: true, status: true, payAmount: true, shipTime: true, raw: true },
        }),
        this.prisma.wechatStoreAftersale.findMany({
          where: { storeId: store.id, createTime: { gte: startSec, lte: endSec } },
          select: { status: true, amount: true, raw: true },
        }),
        this.prisma.wechatStoreAftersale.findMany({
          where: { storeId: store.id, createTime: { gte: startSec, lte: sourceRefundEndSec } },
          select: { status: true, amount: true, raw: true },
        }),
      ])

      const transactionOrders = orders.filter((o) => !WECHAT_NON_REVENUE_STATUSES.has(o.status))
      const transactionOrderIds = new Set(transactionOrders.map((o) => o.orderId))
      const totalAmount = transactionOrders.reduce((sum, o) => {
        const raw = o.raw as any
        const productPrice = raw?.order_detail?.price_info?.product_price
        return sum + (Number(productPrice) || o.payAmount)
      }, 0)
      const successfulRefunds = aftersales.filter(
        (a) =>
          a.status === WECHAT_SUCCESSFUL_REFUND_STATUS &&
          Number(a.amount) > 0 &&
          this.isWechatRefundInOrderScope(a.raw, transactionOrderIds),
      )
      const sourceRefundsByOrderId = this.buildWechatRefundMap(
        sourceAftersales.filter(
          (a) =>
            a.status === WECHAT_SUCCESSFUL_REFUND_STATUS &&
            Number(a.amount) > 0 &&
            this.isWechatRefundInOrderScope(a.raw, transactionOrderIds),
        ),
      )

      summaries.push({
        storeName: store.name,
        totalOrderCount: transactionOrders.length,
        orderCount: transactionOrders.length,
        totalAmount,
        refundCount: successfulRefunds.length,
        refundAmount: successfulRefunds.reduce((sum, a) => sum + a.amount, 0),
        sources: this.buildWechatSourceSummaries(store.id, orders, sourceRefundsByOrderId),
      })
    }

    return summaries
  }

  private async collectDoudianStoreSummaries(
    startSec: number,
    endSec: number,
    organizationId: string | null,
  ): Promise<StoreOrderSummary[]> {
    const stores = await (this.prisma as any).doudianStore.findMany({
      where: { status: 'ACTIVE', organizationId },
      select: { id: true, name: true },
    })

    const summaries: StoreOrderSummary[] = []

    for (const store of stores) {
      const [orders, aftersales] = await Promise.all([
        (this.prisma as any).doudianStoreOrder.findMany({
          where: { storeId: store.id, createTime: { gte: startSec, lte: endSec } },
          select: { orderId: true, payAmount: true, status: true, createTime: true, raw: true },
        }),
        (this.prisma as any).doudianStoreAftersale.findMany({
          where: { storeId: store.id },
          select: { amount: true, status: true, orderId: true, createTime: true, updateTime: true },
        }),
      ])

      const summary = buildDoudianSummary(
        orders.map(
          (o: any): DoudianOrderMetric => ({
            order_id: o.orderId,
            status: o.status,
            pay_amount: o.payAmount,
            create_time: o.createTime,
          }),
        ),
        aftersales.map(
          (a: any): DoudianAftersaleMetric => ({
            order_id: a.orderId,
            status: a.status,
            amount: a.amount,
            create_time: a.createTime,
            update_time: a.updateTime,
          }),
        ),
        { start: startSec, end: endSec },
        'yesterday',
      )
      const doudianOrders = orders.map((o: any) => ({
        order_id: o.orderId,
        status: o.status,
        pay_amount: o.payAmount,
        create_time: o.createTime,
        raw: o.raw,
      }))
      const doudianAftersales = aftersales.map((a: any) => ({
        order_id: a.orderId,
        status: a.status,
        amount: a.amount,
        create_time: a.createTime,
        update_time: a.updateTime,
      }))

      summaries.push({
        storeName: store.name,
        totalOrderCount: summary.count,
        orderCount: summary.effectiveCount,
        totalAmount: summary.gross,
        refundCount: summary.refundCount,
        refundAmount: summary.refund,
        sources: this.buildDoudianSourceSummaries(
          store.name,
          doudianOrders,
          doudianAftersales,
          startSec,
          endSec,
        ),
      })
    }

    return summaries
  }

  private buildReportContent(
    dateLabel: string,
    wechat: StoreOrderSummary[],
    doudian: StoreOrderSummary[],
  ): string {
    const lines: string[] = []
    const allStores = [
      ...wechat.map((s) => ({ ...s, platform: '微信小店' })),
      ...doudian.map((s) => ({ ...s, platform: '抖店' })),
    ]

    const totalOrders = allStores.reduce((sum, s) => sum + s.totalOrderCount, 0)
    const totalRevenueOrders =
      wechat.reduce((sum, s) => sum + s.orderCount, 0) +
      doudian.reduce((sum, s) => sum + s.orderCount + s.refundCount, 0)
    const totalAmount = allStores.reduce((sum, s) => sum + s.totalAmount, 0)
    const totalRefunds = allStores.reduce((sum, s) => sum + s.refundCount, 0)
    const totalRefundAmount = allStores.reduce((sum, s) => sum + s.refundAmount, 0)
    const netAmount = Math.max(0, totalAmount - totalRefundAmount)
    lines.push(`📅 ${dateLabel} 订单汇总`)
    lines.push('已在发送前采集最新订单数据')
    lines.push('')
    lines.push('【总览】')
    lines.push(`店铺：微信小店 ${wechat.length} 家 / 抖店 ${doudian.length} 家`)
    lines.push(`出单：${totalOrders} 单`)
    lines.push(`计入成交额：${totalRevenueOrders} 单`)
    lines.push(`成交额：¥${this.formatMoney(totalAmount)}（未扣退款）`)
    lines.push(`退款：${totalRefunds} 笔 / ¥${this.formatMoney(totalRefundAmount)}`)
    if (totalRefundAmount > 0) {
      lines.push(`扣退款后：¥${this.formatMoney(netAmount)}`)
    }
    lines.push('')

    if (wechat.length > 0) {
      lines.push('【微信小店】')
      for (const s of wechat) {
        this.appendStoreLines(lines, s, 'wechat')
      }
    }

    if (doudian.length > 0) {
      if (wechat.length > 0) lines.push('')
      lines.push('【抖店】')
      for (const s of doudian) {
        this.appendStoreLines(lines, s, 'doudian')
      }
    }

    lines.push('')
    lines.push('口径：出单含关闭/取消；计入成交额不含关闭/取消，成交额未扣退款；退款仅统计成功退款。')

    return lines.join('\n')
  }

  private appendStoreLines(lines: string[], store: StoreOrderSummary, platform: 'wechat' | 'doudian') {
    const revenueOrderCount =
      platform === 'doudian' ? store.orderCount + store.refundCount : store.orderCount
    const countText =
      store.totalOrderCount === revenueOrderCount
        ? `${revenueOrderCount} 单`
        : `${store.totalOrderCount} 出单 / ${revenueOrderCount} 计入成交额`
    lines.push(
      `- ${store.storeName}：${countText} / ¥${this.formatMoney(store.totalAmount)}` +
        (store.refundCount > 0
          ? `；退 ${store.refundCount} 笔 / ¥${this.formatMoney(store.refundAmount)}`
          : ''),
    )
    this.appendSourceLines(lines, store.sources)
  }

  private appendSourceLines(lines: string[], sources: OrderSourceSummary[]) {
    if (sources.length === 0) {
      lines.push('  达人/来源：暂无')
      return
    }

    lines.push('  达人/来源：')
    sources.forEach((source, index) => {
      lines.push(
        `  ${index + 1}. ${source.name}：${source.orderCount}单 / ¥${this.formatMoney(source.totalAmount)}` +
          (source.refundCount > 0
            ? `；退${source.refundCount}笔 / ¥${this.formatMoney(source.refundAmount)}`
            : ''),
      )
    })
  }

  private compactChannel(channel: string) {
    return channel
      .replace('带货达人 / 联盟达人带货', '达人带货')
      .replace('店铺 / 店铺自卖', '店铺自卖')
      .replace('视频号 / 关联账号', '视频号')
      .replace('未知 / 未知', '未知')
  }

  private formatMoney(amountInFen: number) {
    return (amountInFen / 100).toFixed(2)
  }

  private isWechatRefundInOrderScope(raw: unknown, orderIds: Set<string>): boolean {
    const orderId = this.getWechatAftersaleOrderId(raw)
    return !orderId || orderIds.has(orderId)
  }

  private getWechatAftersaleOrderId(raw: unknown): string {
    const aftersale = raw as any
    return String(
      aftersale?.order_id ||
        aftersale?.orderId ||
        aftersale?.order_info?.order_id ||
        aftersale?.order_info?.orderId ||
        aftersale?.order_detail?.order_id ||
        '',
    )
  }

  private buildWechatRefundMap(aftersales: Array<{ amount: number; raw: unknown }>) {
    const map = new Map<string, { count: number; amount: number }>()
    for (const item of aftersales) {
      const orderId = this.getWechatAftersaleOrderId(item.raw)
      if (!orderId) continue
      const existing = map.get(orderId) || { count: 0, amount: 0 }
      existing.count += 1
      existing.amount += Number(item.amount || 0)
      map.set(orderId, existing)
    }
    return map
  }

  private buildWechatSourceSummaries(
    storeId: string,
    orders: Array<{ orderId: string; payAmount: number; shipTime: number; raw: unknown }>,
    refundsByOrderId: Map<string, { count: number; amount: number }>,
  ): OrderSourceSummary[] {
    const map = new Map<string, OrderSourceSummary>()
    for (const order of orders) {
      if (Number(order.shipTime || 0) <= 0) continue

      const raw = order.raw as any
      const source = this.getWechatSource(raw, storeId)
      const key = source.account_id || `${source.account_type}:${source.account_nickname}`
      const existing =
        map.get(key) ||
        {
          name: source.account_nickname || source.account_id || '未知来源',
          channel: this.wechatSourceLabel(source.account_type, source.sale_channel),
          orderCount: 0,
          totalAmount: 0,
          refundCount: 0,
          refundAmount: 0,
        }

      existing.orderCount += 1
      existing.totalAmount += this.getWechatOrderAmount(order)
      const refund = refundsByOrderId.get(order.orderId)
      if (refund) {
        existing.refundCount += refund.count
        existing.refundAmount += refund.amount
      }
      map.set(key, existing)
    }

    return this.sortSourceSummaries(map)
  }

  private getWechatSource(raw: any, storeId: string) {
    const sourceInfos = raw?.order_detail?.source_infos
    const primary = Array.isArray(sourceInfos)
      ? sourceInfos.find((source) => source?.account_nickname || source?.account_id)
      : null
    return (
      primary || {
        account_type: 'store',
        account_id: `store:${storeId}`,
        account_nickname: '店铺出单',
        sale_channel: 'store',
      }
    )
  }

  private getWechatOrderAmount(order: { payAmount: number; raw: unknown }) {
    const raw = order.raw as any
    return Number(raw?.order_detail?.price_info?.product_price) || Number(order.payAmount || 0)
  }

  private wechatSourceLabel(accountType: string, saleChannel: string) {
    const typeLabels: Record<string, string> = {
      '1': '视频号',
      '5': '带货达人',
      store: '店铺',
    }
    const channelLabels: Record<string, string> = {
      '0': '关联账号',
      '100': '联盟达人带货',
      store: '店铺自卖',
    }
    return [typeLabels[String(accountType)] || String(accountType || ''), channelLabels[String(saleChannel)] || String(saleChannel || '')]
      .filter(Boolean)
      .join(' / ')
  }

  private buildDoudianSourceSummaries(
    storeName: string,
    orders: Array<{
      order_id: string
      status: number
      pay_amount: number
      create_time: number
      raw: unknown
    }>,
    aftersales: DoudianAftersaleMetric[],
    startSec: number,
    endSec: number,
  ): OrderSourceSummary[] {
    const successfulRefundOrderIds = getDoudianSuccessfulRefundOrderIds(aftersales)
    const revenueOrders = getDoudianRevenueOrders(orders, successfulRefundOrderIds)
    const revenueOrderIds = new Set(revenueOrders.map((order) => String(order.order_id)))
    const refunds = filterDoudianRefunds(
      aftersales,
      { start: startSec, end: endSec },
      'yesterday',
      revenueOrderIds,
    )
    const refundsByOrderId = new Map<string, { count: number; amount: number }>()
    for (const refund of refunds) {
      const orderId = String(refund.order_id || '')
      if (!orderId) continue
      const existing = refundsByOrderId.get(orderId) || { count: 0, amount: 0 }
      existing.count += 1
      existing.amount += Number(refund.amount || 0)
      refundsByOrderId.set(orderId, existing)
    }

    const map = new Map<string, OrderSourceSummary>()
    for (const order of orders) {
      const shouldCountOrder = revenueOrderIds.has(String(order.order_id))
      const refund = refundsByOrderId.get(String(order.order_id))
      if (!shouldCountOrder && !refund) continue

      const author = extractDoudianAuthor(order.raw)
      const isSelf = !author.author_name && !author.author_id
      const key = isSelf ? '__self_store__' : author.author_id || author.author_name
      const existing =
        map.get(key) ||
        {
          name: isSelf
            ? storeName || '店铺自卖'
            : author.author_name || author.author_id || '未知来源',
          channel: isSelf ? '小店自卖' : author.author_source || '联盟达人带货',
          orderCount: 0,
          totalAmount: 0,
          refundCount: 0,
          refundAmount: 0,
        }

      if (shouldCountOrder) {
        existing.orderCount += 1
        existing.totalAmount += Number(order.pay_amount || 0)
      }
      if (refund) {
        existing.refundCount += refund.count
        existing.refundAmount += refund.amount
      }
      map.set(key, existing)
    }

    return this.sortSourceSummaries(map)
  }

  private sortSourceSummaries(map: Map<string, OrderSourceSummary>) {
    return Array.from(map.values()).sort(
      (a, b) =>
        b.totalAmount - a.totalAmount ||
        b.orderCount - a.orderCount ||
        b.refundCount - a.refundCount,
    )
  }

  private async getActiveStoreOrganizationIds(): Promise<Array<string | null>> {
    const [wechatStores, doudianStores] = await Promise.all([
      this.prisma.wechatStore.findMany({
        where: { status: 'ACTIVE' },
        select: { organizationId: true },
      }),
      (this.prisma as any).doudianStore.findMany({
        where: { status: 'ACTIVE' },
        select: { organizationId: true },
      }),
    ])

    return Array.from(
      new Set<string | null>([
        ...wechatStores.map((s) => s.organizationId || null),
        ...doudianStores.map((s: any) => s.organizationId || null),
      ]),
    )
  }

  private async getAdminUserIds(organizationId: string | null): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: [...ADMIN_ROLES] as any }, status: 'ACTIVE', organizationId },
      select: { id: true },
    })

    if (admins.length > 0) {
      return admins.map((a) => a.id)
    }

    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', organizationId },
      select: { id: true },
      take: 10,
    })
    return users.map((u) => u.id)
  }
}
