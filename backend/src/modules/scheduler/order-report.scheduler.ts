import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../../common/prisma-enums'

interface StoreOrderSummary {
  storeName: string
  orderCount: number
  totalAmount: number
  refundCount: number
  refundAmount: number
}

// ── 微信小店订单状态 ──────────────────────────────────
// 非成交状态：待付款(10)、待收款(12)、已取消(250)
const WECHAT_NON_REVENUE_STATUSES = new Set([10, 12, 250])
// 成功退款状态（字符串，存在 WechatStoreAftersale.status 字段）
const WECHAT_SUCCESSFUL_REFUND_STATUS = 'MERCHANT_REFUND_SUCCESS'

// ── 抖店订单状态 ──────────────────────────────────────
// 已关闭订单状态：4=已关闭、5=已关闭、21=已关闭
const DOUDIAN_CLOSED_ORDER_STATUSES = new Set([4, 5, 21])
// 成功退款状态：6=已退款、12=已退款、27=已退款
const DOUDIAN_SUCCESSFUL_REFUND_STATUSES = new Set([6, 12, 27])

/**
 * 每日 9:00 推送昨日订单汇总（微信小店 + 抖店）
 */
@Injectable()
export class OrderReportScheduler {
  private readonly logger = new Logger(OrderReportScheduler.name)
  private readonly beijingOffsetMs = 8 * 60 * 60 * 1000

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  @Cron('0 9 * * *')
  async handleDailyOrderReport() {
    this.logger.log('开始生成每日订单报告...')

    try {
      const { start, end, dateLabel } = this.getYesterdayRange()

      const [wechatSummaries, doudianSummaries] = await Promise.all([
        this.collectWechatStoreSummaries(start, end),
        this.collectDoudianStoreSummaries(start, end),
      ])

      const hasData =
        wechatSummaries.some((s) => s.orderCount > 0 || s.refundCount > 0) ||
        doudianSummaries.some((s) => s.orderCount > 0 || s.refundCount > 0)

      if (!hasData) {
        this.logger.log('昨日无订单数据，跳过推送')
        return
      }

      const content = this.buildReportContent(dateLabel, wechatSummaries, doudianSummaries)
      const userIds = await this.getAdminUserIds()

      for (const userId of userIds) {
        await this.notificationsService.create({
          userId,
          type: NotificationType.REPORT,
          title: `📊 昨日订单汇总（${dateLabel}）`,
          content,
          metadata: {
            reportType: 'daily_orders',
            date: dateLabel,
            wechatStores: wechatSummaries,
            doudianStores: doudianSummaries,
          },
        })
      }

      this.logger.log(`订单报告已推送给 ${userIds.length} 个用户`)
    } catch (error: any) {
      this.logger.error(`订单报告生成失败: ${error.message}`, error.stack)
    }
  }

  // ── 手动触发（供 API 调用） ──────────────────────────

  async triggerManually(): Promise<{ pushed: boolean; message: string }> {
    this.logger.log('手动触发订单报告...')
    try {
      await this.handleDailyOrderReport()
      return { pushed: true, message: '订单报告已推送' }
    } catch (error: any) {
      return { pushed: false, message: error.message }
    }
  }

  // ── 时间范围 ──────────────────────────────────────────

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

    const startSec = Math.floor(beijingYesterday.getTime() / 1000)
    const endSec = Math.floor(beijingToday.getTime() / 1000)

    // dateLabel 用 beijingNow（已偏移到北京时间）的日期减 1，避免时区错位
    const yLabel = beijingNow.getUTCFullYear()
    const mLabel = beijingNow.getUTCMonth()
    const dLabel = new Date(Date.UTC(yLabel, mLabel, beijingNow.getUTCDate() - 1))
    const dateLabel = `${dLabel.getUTCFullYear()}-${String(dLabel.getUTCMonth() + 1).padStart(2, '0')}-${String(dLabel.getUTCDate()).padStart(2, '0')}`

    return { start: startSec, end: endSec, dateLabel }
  }

  // ── 微信小店汇总 ──────────────────────────────────────

  private async collectWechatStoreSummaries(
    startSec: number,
    endSec: number,
  ): Promise<StoreOrderSummary[]> {
    const stores = await this.prisma.wechatStore.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    })

    const summaries: StoreOrderSummary[] = []

    for (const store of stores) {
      const [orders, aftersales] = await Promise.all([
        this.prisma.wechatStoreOrder.findMany({
          where: { storeId: store.id, createTime: { gte: startSec, lt: endSec } },
          select: { orderId: true, status: true, payAmount: true, raw: true },
        }),
        this.prisma.wechatStoreAftersale.findMany({
          where: { storeId: store.id, createTime: { gte: startSec, lt: endSec } },
          select: { afterSaleOrderId: true, status: true, amount: true },
        }),
      ])

      // 成交订单 = 排除待付款(10)、待收款(12)、已取消(250)
      const transactionOrders = orders.filter((o) => !WECHAT_NON_REVENUE_STATUSES.has(o.status))

      // 成交金额 = product_price 之和（与微信小店官方一致），fallback 到 payAmount
      const totalAmount = transactionOrders.reduce((sum, o) => {
        const raw = o.raw as any
        const productPrice = raw?.order_detail?.price_info?.product_price
        return sum + (Number(productPrice) || o.payAmount)
      }, 0)

      // 成功退款 = status 为 MERCHANT_REFUND_SUCCESS 且金额 > 0
      const successfulRefunds = aftersales.filter(
        (a) => a.status === WECHAT_SUCCESSFUL_REFUND_STATUS && Number(a.amount) > 0,
      )

      summaries.push({
        storeName: store.name,
        orderCount: transactionOrders.length,
        totalAmount,
        refundCount: successfulRefunds.length,
        refundAmount: successfulRefunds.reduce((sum, a) => sum + a.amount, 0),
      })
    }

    return summaries
  }

  // ── 抖店汇总 ──────────────────────────────────────────

  private async collectDoudianStoreSummaries(
    startSec: number,
    endSec: number,
  ): Promise<StoreOrderSummary[]> {
    const stores = await (this.prisma as any).doudianStore.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true },
    })

    const summaries: StoreOrderSummary[] = []

    for (const store of stores) {
      const [orders, aftersales] = await Promise.all([
        (this.prisma as any).doudianStoreOrder.findMany({
          where: { storeId: store.id, createTime: { gte: startSec, lt: endSec } },
          select: { payAmount: true, status: true },
        }),
        (this.prisma as any).doudianStoreAftersale.findMany({
          where: { storeId: store.id, createTime: { gte: startSec, lt: endSec } },
          select: { amount: true, status: true, orderId: true },
        }),
      ])

      // 有效订单 = 排除已关闭订单(status 4, 5, 21)
      const effectiveOrders = orders.filter(
        (o: any) => !DOUDIAN_CLOSED_ORDER_STATUSES.has(o.status),
      )

      // 成功退款 = status 为已退款(6, 12, 27) 且金额 > 0
      const successfulRefunds = aftersales.filter(
        (a: any) => DOUDIAN_SUCCESSFUL_REFUND_STATUSES.has(a.status) && Number(a.amount) > 0,
      )

      summaries.push({
        storeName: store.name,
        orderCount: effectiveOrders.length,
        totalAmount: effectiveOrders.reduce((sum: number, o: any) => sum + o.payAmount, 0),
        refundCount: successfulRefunds.length,
        refundAmount: successfulRefunds.reduce((sum: number, a: any) => sum + a.amount, 0),
      })
    }

    return summaries
  }

  // ── 构建报告文本 ──────────────────────────────────────

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

    const totalOrders = allStores.reduce((sum, s) => sum + s.orderCount, 0)
    const totalAmount = allStores.reduce((sum, s) => sum + s.totalAmount, 0)
    const totalRefunds = allStores.reduce((sum, s) => sum + s.refundCount, 0)
    const totalRefundAmount = allStores.reduce((sum, s) => sum + s.refundAmount, 0)

    lines.push(`📅 ${dateLabel} 订单汇总`)
    lines.push('')
    lines.push(`总订单 ${totalOrders} 单 / ¥${(totalAmount / 100).toFixed(2)}`)
    if (totalRefunds > 0) {
      lines.push(`退款 ${totalRefunds} 笔 / ¥${(totalRefundAmount / 100).toFixed(2)}`)
    }
    lines.push('')

    if (wechat.length > 0) {
      lines.push('【微信小店】')
      for (const s of wechat) {
        lines.push(
          `  ${s.storeName}: ${s.orderCount}单 ¥${(s.totalAmount / 100).toFixed(2)}` +
            (s.refundCount > 0
              ? ` | 退款${s.refundCount}笔 ¥${(s.refundAmount / 100).toFixed(2)}`
              : ''),
        )
      }
    }

    if (doudian.length > 0) {
      lines.push('【抖店】')
      for (const s of doudian) {
        lines.push(
          `  ${s.storeName}: ${s.orderCount}单 ¥${(s.totalAmount / 100).toFixed(2)}` +
            (s.refundCount > 0
              ? ` | 退款${s.refundCount}笔 ¥${(s.refundAmount / 100).toFixed(2)}`
              : ''),
        )
      }
    }

    return lines.join('\n')
  }

  // ── 获取管理员用户 ────────────────────────────────────

  private async getAdminUserIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    })

    if (admins.length > 0) {
      return admins.map((a) => a.id)
    }

    // 如果没有管理员，发给所有活跃用户
    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      take: 10,
    })
    return users.map((u) => u.id)
  }
}
