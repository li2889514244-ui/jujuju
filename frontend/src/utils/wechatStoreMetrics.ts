import dayjs from 'dayjs'

export interface WechatOrderMetric {
  order_id: string
  status: number
  pay_amount: number
  create_time: number
}

export interface WechatAftersaleMetric {
  id?: string
  order_id?: string
  status?: string
  amount?: number
  create_time?: number
  complete_time?: number
}

export interface SalesStats {
  gmv: number
  count: number
  effectiveCount: number
  avg: number
  gross: number
  refund: number
  deduction: number
}

export interface DailySalesStats {
  date: string
  gmv: number
  orders: number
}

export interface StatusBucket {
  label: string
  count: number
}

const NON_REVENUE_ORDER_STATUSES = new Set([10, 12, 250])
const REFUNDED_ORDER_STATUS = 200
const SUCCESSFUL_REFUND_STATUS = 'MERCHANT_REFUND_SUCCESS'

const STATUS_BUCKETS: Array<{ label: string; statuses: number[] }> = [
  { label: '待付款', statuses: [10, 12] },
  { label: '待发货', statuses: [20, 21] },
  { label: '已发货', statuses: [30] },
  { label: '已完成', statuses: [100] },
  { label: '已取消', statuses: [200, 250] },
]

function safeAmount(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

function isSuccessfulRefund(item: WechatAftersaleMetric) {
  return item.status === SUCCESSFUL_REFUND_STATUS && safeAmount(item.amount) > 0
}

function orderDate(order: WechatOrderMetric) {
  return dayjs.unix(order.create_time).format('MM-DD')
}

function aftersaleDate(item: WechatAftersaleMetric) {
  return item.create_time ? dayjs.unix(item.create_time).format('MM-DD') : ''
}

export function normalizeAftersales<T extends WechatAftersaleMetric>(items: T[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = item.id || ''
    if (key) {
      if (seen.has(key)) return false
      seen.add(key)
    }
    return true
  })
}

export function calculateNetSales(
  orders: WechatOrderMetric[],
  aftersales: WechatAftersaleMetric[],
): SalesStats {
  const rawTotal = orders.reduce((sum, order) => sum + safeAmount(order.pay_amount), 0)
  const effectiveCount = orders.filter(
    (order) =>
      !NON_REVENUE_ORDER_STATUSES.has(order.status) && order.status !== REFUNDED_ORDER_STATUS,
  ).length
  const gross = orders.reduce((sum, order) => {
    if (NON_REVENUE_ORDER_STATUSES.has(order.status)) return sum
    return sum + safeAmount(order.pay_amount)
  }, 0)

  const refundedOrders = orders.filter((order) => order.status === REFUNDED_ORDER_STATUS)
  const refundedOrderAmount = refundedOrders.reduce(
    (sum, order) => sum + safeAmount(order.pay_amount),
    0,
  )
  const refundedOrderIds = new Set(
    refundedOrders.map((order) => String(order.order_id)).filter(Boolean),
  )
  const successfulRefunds = aftersales.filter(isSuccessfulRefund)
  const successfulRefundTotal = successfulRefunds.reduce(
    (sum, item) => sum + safeAmount(item.amount),
    0,
  )

  const hasRefundOrderIds = successfulRefunds.some((item) => item.order_id)
  const extraRefundAmount = successfulRefunds.reduce((sum, item) => {
    const orderId = item.order_id ? String(item.order_id) : ''
    if (orderId && refundedOrderIds.has(orderId)) return sum
    return sum + safeAmount(item.amount)
  }, 0)

  const refund = hasRefundOrderIds
    ? refundedOrderAmount + extraRefundAmount
    : Math.max(refundedOrderAmount, successfulRefundTotal)
  const gmv = gross - refund
  const count = orders.length

  return {
    gmv,
    count,
    effectiveCount,
    avg: effectiveCount > 0 ? gmv / effectiveCount : 0,
    gross,
    refund,
    deduction: Math.max(0, rawTotal - gmv),
  }
}

export function buildStatusBreakdown(orders: WechatOrderMetric[]): StatusBucket[] {
  return STATUS_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: orders.filter((order) => bucket.statuses.includes(order.status)).length,
  }))
}

export function buildDailySales(
  orders: WechatOrderMetric[],
  aftersales: WechatAftersaleMetric[],
): DailySalesStats[] {
  const dates = new Set<string>()
  const grossByDate = new Map<string, number>()
  const refundByDate = new Map<string, number>()
  const ordersByDate = new Map<string, number>()
  const refundedOrderIds = new Set<string>()

  orders.forEach((order) => {
    const date = orderDate(order)
    const amount = safeAmount(order.pay_amount)
    dates.add(date)
    ordersByDate.set(date, (ordersByDate.get(date) || 0) + 1)

    if (NON_REVENUE_ORDER_STATUSES.has(order.status)) return
    grossByDate.set(date, (grossByDate.get(date) || 0) + amount)

    if (order.status === REFUNDED_ORDER_STATUS) {
      refundedOrderIds.add(String(order.order_id))
      refundByDate.set(date, (refundByDate.get(date) || 0) + amount)
    }
  })

  aftersales.forEach((item) => {
    if (!isSuccessfulRefund(item)) return
    const orderId = item.order_id ? String(item.order_id) : ''
    if (orderId && refundedOrderIds.has(orderId)) return

    const date = aftersaleDate(item)
    if (!date) return
    dates.add(date)
    refundByDate.set(date, (refundByDate.get(date) || 0) + safeAmount(item.amount))
  })

  return [...dates].sort().map((date) => ({
    date,
    gmv: (grossByDate.get(date) || 0) - (refundByDate.get(date) || 0),
    orders: ordersByDate.get(date) || 0,
  }))
}
