import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationType } from '../../common/prisma-enums'
import { PrismaService } from '../../prisma/prisma.service'
import {
  buildDoudianSummary,
  DoudianAftersaleMetric,
  DoudianOrderMetric,
} from '../doudian-browser/doudian-store-metrics'
import { NotificationsService } from '../notifications/notifications.service'
import { computeReconcileDifferences, ReconcileCounts } from './reconcile-compare'

const ADMIN_ROLES = ['ADMIN', 'OWNER', 'SUPER_ADMIN'] as const

interface ReconcileSqlRow {
  day_total: number | bigint | string
  revenue_total: number | bigint | string
  refunded_total: number | bigint | string
  gross: number | bigint | string
  refund_amount: number | bigint | string
}

interface StoreReconcileResult {
  storeId: string
  storeName: string
  organizationId: string | null
  code: {
    count: number
    total: number
    valid: number
    refunded: number
    gross: number
    refund: number
  }
  sql: {
    count: number
    total: number
    refunded: number
    gross: number
    refund: number
  }
  /** 同步窗口内（订单最早同步时间之后）成功退款但订单不在库中的笔数：真缺失，需关注 */
  orphanRecent: number
  /** 订单同步窗口之前的老退款：订单从未采集，属历史口径外，仅信息展示 */
  orphanHistorical: number
  differences: string[]
}

const REFUND_SUCCESS_TEXT_SQL = `(
  a.status IN (12,27)
  OR COALESCE(a.raw->'after_sale_info'->>'after_sale_status_text', a.raw->'text_part'->>'after_sale_status_text', '') LIKE '%已退款%'
  OR COALESCE(a.raw->'after_sale_info'->>'after_sale_status_text', a.raw->'text_part'->>'after_sale_status_text', '') LIKE '%退款成功%'
)`

const REFUND_SUCCESS_TEXT_DAY_SQL = `(
  r.ast IN (12,27)
  OR r.atext LIKE '%已退款%'
  OR r.atext LIKE '%退款成功%'
)`

@Injectable()
export class DailyReconciliationScheduler {
  private readonly logger = new Logger(DailyReconciliationScheduler.name)
  private readonly beijingOffsetMs = 8 * 60 * 60 * 1000

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * 每日自动对账（北京时间 09:10，紧跟 08:30 日报采集与 09:00 日报之后）：
   * 对每一家活跃抖店，用两条独立路径重算昨日口径——
   *  A. 生产口径（doudian-store-metrics.buildDoudianSummary，与页面 API 相同）；
   *  B. 数据库独立重算（纯 SQL，与 TS 口径模块无共享代码）。
   * 两者不一致 → 推 🔴 对账异常；一致 → 推 ✅ 对账通过明细，方便与抖店后台人工核对。
   */
  @Cron('10 9 * * *', { timeZone: 'Asia/Shanghai' })
  async reconcileYesterday() {
    const { start, end, dateLabel } = this.getYesterdayRange()
    this.logger.log(`开始每日对账: ${dateLabel}`)

    try {
      const results = await this.reconcileAllStores(start, end)
      if (results.length === 0) {
        this.logger.log('没有活跃抖店，跳过对账推送')
        return
      }

      const organizations = new Map<string | null, StoreReconcileResult[]>()
      for (const result of results) {
        const key = result.organizationId || null
        if (!organizations.has(key)) organizations.set(key, [])
        organizations.get(key)!.push(result)
      }

      let pushedCount = 0
      for (const [organizationId, orgResults] of organizations) {
        const hasOrders = orgResults.some((r) => r.sql.count > 0)
        const hasAnomaly = orgResults.some((r) => r.differences.length > 0)
        if (!hasOrders && !hasAnomaly) continue

        const userIds = await this.getAdminUserIds(organizationId)
        if (userIds.length === 0) {
          this.logger.warn(`组织 ${organizationId || 'default'} 没有可接收对账结果的用户`)
          continue
        }

        const content = this.buildContent(dateLabel, orgResults)
        const ok = orgResults.every((r) => r.differences.length === 0)
        let pushedFeishu = false
        for (const userId of userIds) {
          await this.notificationsService.create({
            userId,
            organizationId,
            type: NotificationType.REPORT,
            title: ok
              ? `✅ 每日对账通过（${dateLabel}）`
              : `🔴 每日对账异常（${dateLabel}）`,
            content,
            metadata: {
              reportType: 'daily_reconciliation',
              date: dateLabel,
              organizationId,
              ok,
              stores: orgResults.map((r) => ({
                storeId: r.storeId,
                storeName: r.storeName,
                code: r.code,
                sql: r.sql,
                differences: r.differences,
              })),
            },
            pushFeishu: !pushedFeishu,
          })
          pushedFeishu = true
          pushedCount++
        }
      }

      this.logger.log(
        pushedCount > 0 ? `对账结果已推送 ${pushedCount} 次` : '昨日无抖店订单数据，跳过对账推送',
      )
    } catch (error: any) {
      this.logger.error(`每日对账失败: ${error.message}`, error.stack)
    }
  }

  async triggerManually(): Promise<{ pushed: boolean; message: string }> {
    this.logger.log('手动触发每日对账...')
    try {
      await this.reconcileYesterday()
      return { pushed: true, message: '每日对账已执行' }
    } catch (error: any) {
      return { pushed: false, message: error.message }
    }
  }

  async reconcileAllStores(start: number, end: number): Promise<StoreReconcileResult[]> {
    const stores = await (this.prisma as any).doudianStore.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, name: true, organizationId: true },
    })

    const results: StoreReconcileResult[] = []
    for (const store of stores) {
      const result = await this.reconcileOneStore(
        store.id,
        store.name,
        store.organizationId || null,
        start,
        end,
      )
      results.push(result)
      const diffText = result.differences.length
        ? `发现 ${result.differences.length} 处差异`
        : '一致'
      this.logger.log(`[对账] ${result.storeName}: ${diffText}`)
    }
    return results
  }

  private async reconcileOneStore(
    storeId: string,
    storeName: string,
    organizationId: string | null,
    start: number,
    end: number,
  ): Promise<StoreReconcileResult> {
    // ── 路径 A：生产口径（与页面 API 完全相同的输入映射 + buildDoudianSummary）──
    const [orderRows, aftersaleRows] = await Promise.all([
      (this.prisma as any).doudianStoreOrder.findMany({
        where: { storeId, createTime: { gte: start, lte: end } },
        select: { orderId: true, status: true, payAmount: true, createTime: true, raw: true },
      }),
      (this.prisma as any).doudianStoreAftersale.findMany({
        where: { storeId },
        select: { orderId: true, status: true, amount: true, createTime: true, updateTime: true, raw: true },
      }),
    ])

    const orderMetrics: DoudianOrderMetric[] = orderRows.map((row: any) => ({
      order_id: row.orderId,
      status: row.status,
      status_text:
        row.raw?.order_status_text || row.raw?.order_status_info?.order_status_text || '',
      pay_amount: row.payAmount,
      create_time: row.createTime,
    }))
    const aftersaleMetrics: DoudianAftersaleMetric[] = aftersaleRows.map((row: any) => ({
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

    const summary = buildDoudianSummary(orderMetrics, aftersaleMetrics, { start, end }, 'yesterday')

    // ── 路径 B：数据库独立重算（纯 SQL，不调用任何口径模块函数）──
    const sql = await this.recountInSql(storeId, start, end)

    // ── 孤儿退款（成功退款但订单不在库中：会被所有视图静默丢弃，仅提示不判错）──
    // 按店铺订单最早同步时间拆分：窗口内的是真缺失，窗口前的是从未采集的老订单（历史口径外）。
    const orderMinRows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT COALESCE(min("createTime"), 0) AS ct FROM "DoudianStoreOrder" WHERE "storeId" = $1`,
      storeId,
    )
    const orderMinCreateTime = Number(orderMinRows?.[0]?.ct || 0)
    const orphanRows = await (this.prisma as any).$queryRawUnsafe(
      `SELECT
        count(*) FILTER (WHERE ct < $2) AS historical,
        count(*) FILTER (WHERE ct >= $2) AS recent
      FROM (
        SELECT DISTINCT a."orderId", min(a."createTime") AS ct
        FROM "DoudianStoreAftersale" a
        WHERE a."storeId" = $1 AND a."orderId" <> '' AND ${REFUND_SUCCESS_TEXT_SQL}
          AND NOT EXISTS (
            SELECT 1 FROM "DoudianStoreOrder" o
            WHERE o."storeId" = a."storeId" AND o."orderId" = a."orderId"
          )
        GROUP BY a."orderId"
      ) t`,
      storeId,
      orderMinCreateTime,
    )

    const code: ReconcileCounts = {
      count: summary.count,
      total: summary.totalOrderCount,
      valid: summary.validOrderCount,
      refunded: summary.refundedOrderCount,
      gross: summary.gross,
      refund: summary.refund,
    }
    const sqlCounts: ReconcileCounts = {
      count: Number(sql.day_total),
      total: Number(sql.revenue_total),
      valid: Number(sql.revenue_total) - Number(sql.refunded_total),
      refunded: Number(sql.refunded_total),
      gross: Number(sql.gross),
      refund: Number(sql.refund_amount),
    }
    const differences = computeReconcileDifferences(code, sqlCounts)

    return {
      storeId,
      storeName,
      organizationId,
      code,
      sql: sqlCounts,
      orphanRecent: Number(orphanRows?.[0]?.recent || 0),
      orphanHistorical: Number(orphanRows?.[0]?.historical || 0),
      differences,
    }
  }

  private async recountInSql(storeId: string, start: number, end: number): Promise<ReconcileSqlRow> {
    const rows: ReconcileSqlRow[] = await (this.prisma as any).$queryRawUnsafe(
      `WITH day_orders AS (
        SELECT "orderId" AS oid, status AS st, "payAmount" AS pay,
               COALESCE(raw->>'order_status_text', raw->'order_status_info'->>'order_status_text', '') AS stext
        FROM "DoudianStoreOrder"
        WHERE "storeId" = $1 AND "createTime" >= $2 AND "createTime" <= $3
      ),
      success_refund AS (
        SELECT DISTINCT "orderId" AS oid, status AS ast, amount AS amt,
               COALESCE(raw->'after_sale_info'->>'after_sale_status_text', raw->'text_part'->>'after_sale_status_text', '') AS atext
        FROM "DoudianStoreAftersale"
        WHERE "storeId" = $1 AND "orderId" <> ''
      ),
      success_refund_ids AS (
        SELECT oid FROM success_refund r WHERE ${REFUND_SUCCESS_TEXT_DAY_SQL}
      ),
      revenue AS (
        SELECT o.oid, o.pay FROM day_orders o
        WHERE o.st NOT IN (4,21)
          AND o.stext NOT LIKE '%关闭%' AND o.stext NOT LIKE '%取消%' AND o.stext NOT LIKE '%退款%'
        UNION ALL
        SELECT o.oid, o.pay FROM day_orders o
        WHERE o.oid IN (SELECT oid FROM success_refund_ids)
          AND (o.st IN (4,21) OR o.stext LIKE '%关闭%' OR o.stext LIKE '%取消%' OR o.stext LIKE '%退款%')
      ),
      refund_rows AS (
        SELECT r.amt FROM success_refund r
        WHERE r.oid IN (SELECT oid FROM day_orders) AND ${REFUND_SUCCESS_TEXT_DAY_SQL}
      )
      SELECT
        (SELECT count(*) FROM day_orders) AS day_total,
        (SELECT count(*) FROM revenue) AS revenue_total,
        (SELECT count(*) FROM day_orders WHERE oid IN (SELECT oid FROM success_refund_ids)) AS refunded_total,
        (SELECT COALESCE(sum(pay), 0) FROM revenue) AS gross,
        (SELECT COALESCE(sum(amt), 0) FROM refund_rows) AS refund_amount`,
      storeId,
      start,
      end,
    )
    return rows[0]
  }

  private buildContent(dateLabel: string, results: StoreReconcileResult[]): string {
    const lines: string[] = []
    const ok = results.every((r) => r.differences.length === 0)

    if (ok) {
      lines.push(`✅ ${dateLabel} 抖店数据对账通过`)
      lines.push('页面口径与数据库独立重算一致')
    } else {
      lines.push(`🔴 ${dateLabel} 抖店数据对账异常`)
      lines.push('页面口径与数据库独立重算不一致，请立即排查：')
      lines.push('')
      for (const result of results) {
        if (result.differences.length === 0) continue
        lines.push(`【${result.storeName}】`)
        for (const diff of result.differences) {
          lines.push(`- ${diff}`)
        }
      }
      return lines.join('\n')
    }

    lines.push('')
    for (const result of results) {
      const c = result.code
      lines.push(`【抖店 · ${result.storeName}】`)
      lines.push(`总订单 ${c.total} · 有效 ${c.valid} · 退款 ${c.refunded}`)
      lines.push(
        `成交额 ¥${this.formatMoney(c.gross)}（未扣退款）· 退款 ¥${this.formatMoney(c.refund)}` +
          (c.refund > 0 ? ` · 净 ¥${this.formatMoney(Math.max(0, c.gross - c.refund))}` : ''),
      )
      if (result.orphanRecent > 0) {
        lines.push(`⚠️ ${result.orphanRecent} 笔退款（订单同步开始后发起）找不到对应订单：可能是订单同步缺口，建议核对`)
      }
      if (result.orphanHistorical > 0) {
        lines.push(`ℹ️ 另有 ${result.orphanHistorical} 笔为订单同步开始前发起的老退款（老订单从未采集，不计入统计，属正常）`)
      }
    }
    lines.push('')
    lines.push('口径：退款按订单日归集；总订单 = 有效 + 退款。')
    return lines.join('\n')
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

  private formatMoney(amountInFen: number) {
    return (amountInFen / 100).toFixed(2)
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
