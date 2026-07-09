export type DoudianViewMode = 'today' | 'yesterday' | 'week' | 'month'

export interface DoudianOrderMetric {
  order_id: string
  status: number
  status_text?: string
  pay_amount?: number
  create_time: number
}

export interface DoudianAftersaleMetric {
  id?: string
  order_id?: string
  status: number | string
  status_text?: string
  amount?: number
  create_time?: number
  update_time?: number
}

export interface DoudianRange {
  start: number
  end: number
}

export interface DoudianStatusBucket {
  label: string
  count: number
}

export interface DoudianTrendItem {
  date: string
  gmv: number
  orders: number
}

export interface DoudianSummary {
  mode: DoudianViewMode
  range: DoudianRange
  gross: number
  refund: number
  net: number
  count: number
  effectiveCount: number
  refundCount: number
  statusBreakdown: DoudianStatusBucket[]
  trend: DoudianTrendItem[]
}

const CLOSED_ORDER_STATUSES = new Set([4, 21])
const SUCCESSFUL_REFUND_STATUSES = new Set([12, 27])

function amount(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

function dateLabel(timestamp: number) {
  const date = new Date(timestamp * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}`
}

export function doudianOrderStatus(orderOrStatus: DoudianOrderMetric | number) {
  if (typeof orderOrStatus === 'object' && orderOrStatus.status_text) {
    return orderOrStatus.status_text
  }
  const code = Number(typeof orderOrStatus === 'object' ? orderOrStatus.status : orderOrStatus)
  if (code === 2) return '待发货'
  if (code === 3) return '已发货'
  if (code === 4) return '已关闭'
  if (code === 5) return '已完成'
  if (code === 21) return '已关闭'
  return '待处理'
}

export function isDoudianClosedOrder(orderOrStatus: DoudianOrderMetric | number) {
  const code = Number(typeof orderOrStatus === 'object' ? orderOrStatus.status : orderOrStatus)
  const label = doudianOrderStatus(orderOrStatus)
  return (
    CLOSED_ORDER_STATUSES.has(code) ||
    label.includes('关闭') ||
    label.includes('取消') ||
    label.includes('退款')
  )
}

export function doudianAftersaleStatus(itemOrStatus: DoudianAftersaleMetric | number | string) {
  if (typeof itemOrStatus === 'object' && itemOrStatus.status_text) {
    return itemOrStatus.status_text
  }
  const code = Number(typeof itemOrStatus === 'object' ? itemOrStatus.status : itemOrStatus)
  if ([12, 27].includes(code)) return '已退款'
  if ([1, 2, 3, 6].includes(code)) return '处理中'
  if ([7, 28].includes(code)) return '已关闭'
  return '售后'
}

export function isDoudianSuccessfulRefund(itemOrStatus: DoudianAftersaleMetric | number | string) {
  const code = Number(typeof itemOrStatus === 'object' ? itemOrStatus.status : itemOrStatus)
  const label = doudianAftersaleStatus(itemOrStatus)
  return (
    SUCCESSFUL_REFUND_STATUSES.has(code) || label.includes('退款成功') || label.includes('已退款')
  )
}

export function getDoudianSuccessfulRefundOrderIds(aftersales: DoudianAftersaleMetric[]) {
  return new Set(
    aftersales
      .filter((item) => isDoudianSuccessfulRefund(item) && item.order_id)
      .map((item) => String(item.order_id)),
  )
}

export function isDoudianRevenueOrder(
  order: DoudianOrderMetric,
  successfulRefundOrderIds: Set<string>,
) {
  if (!isDoudianClosedOrder(order)) return true
  return successfulRefundOrderIds.has(String(order.order_id || ''))
}

export function getDoudianRevenueOrders(
  orders: DoudianOrderMetric[],
  successfulRefundOrderIds: Set<string>,
) {
  return orders.filter((order) => isDoudianRevenueOrder(order, successfulRefundOrderIds))
}

export function filterDoudianRefunds(
  aftersales: DoudianAftersaleMetric[],
  range: DoudianRange,
  mode: DoudianViewMode,
  revenueOrderIds: Set<string>,
) {
  return aftersales.filter((item) => {
    const refundTime = Number(item.update_time || item.create_time || 0)
    if (!isDoudianSuccessfulRefund(item) || refundTime < range.start || refundTime > range.end) {
      return false
    }
    if (mode === 'week' || mode === 'month') {
      return revenueOrderIds.has(String(item.order_id || ''))
    }
    return true
  })
}

export function buildDoudianStatusBreakdown(
  displayOrders: DoudianOrderMetric[],
  refundCount: number,
): DoudianStatusBucket[] {
  const labels = ['待发货', '已发货', '已完成', '已关闭', '售后']
  const buckets = new Map(labels.map((label) => [label, 0]))
  for (const order of displayOrders) {
    const label = doudianOrderStatus(order)
    buckets.set(label, (buckets.get(label) || 0) + 1)
  }
  buckets.set('售后', refundCount)
  return Array.from(buckets, ([label, count]) => ({ label, count }))
}

export function buildDoudianTrend(
  displayOrders: DoudianOrderMetric[],
  successfulRefundOrderIds: Set<string>,
): DoudianTrendItem[] {
  const grossByDate = new Map<string, number>()
  const ordersByDate = new Map<string, number>()
  const dates = new Set<string>()

  displayOrders.forEach((order) => {
    const date = dateLabel(order.create_time)
    dates.add(date)
    if (isDoudianRevenueOrder(order, successfulRefundOrderIds)) {
      ordersByDate.set(date, (ordersByDate.get(date) || 0) + 1)
      grossByDate.set(date, (grossByDate.get(date) || 0) + amount(order.pay_amount))
    }
  })

  return [...dates].sort().map((date) => ({
    date,
    gmv: grossByDate.get(date) || 0,
    orders: ordersByDate.get(date) || 0,
  }))
}

export function buildDoudianSummary(
  orders: DoudianOrderMetric[],
  aftersales: DoudianAftersaleMetric[],
  range: DoudianRange,
  mode: DoudianViewMode,
): DoudianSummary {
  const displayOrders = orders.filter(
    (order) => order.create_time >= range.start && order.create_time <= range.end,
  )
  const successfulRefundOrderIds = getDoudianSuccessfulRefundOrderIds(aftersales)
  const revenueOrders = getDoudianRevenueOrders(displayOrders, successfulRefundOrderIds)
  const revenueOrderIds = new Set(revenueOrders.map((order) => String(order.order_id)))
  const displayRefundAftersales = filterDoudianRefunds(aftersales, range, mode, revenueOrderIds)
  const gross = revenueOrders.reduce((sum, order) => sum + amount(order.pay_amount), 0)
  const refund = displayRefundAftersales.reduce((sum, item) => sum + amount(item.amount), 0)

  return {
    mode,
    range,
    gross,
    refund,
    net: gross,
    count: displayOrders.length,
    effectiveCount: revenueOrders.length,
    refundCount: displayRefundAftersales.length,
    statusBreakdown: buildDoudianStatusBreakdown(displayOrders, displayRefundAftersales.length),
    trend: buildDoudianTrend(displayOrders, successfulRefundOrderIds),
  }
}
