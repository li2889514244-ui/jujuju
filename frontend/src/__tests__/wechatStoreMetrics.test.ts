import { describe, expect, it } from 'vitest'
import {
  buildDailySales,
  buildStatusBreakdown,
  calculateNetSales,
  normalizeAftersales,
} from '@/utils/wechatStoreMetrics'

describe('wechatStoreMetrics', () => {
  it('groups refunded and partial-shipped orders into visible buckets', () => {
    const result = buildStatusBreakdown([
      { order_id: '1', status: 21, pay_amount: 100, create_time: 1 },
      { order_id: '2', status: 200, pay_amount: 100, create_time: 1 },
      { order_id: '3', status: 250, pay_amount: 100, create_time: 1 },
    ])

    expect(result).toEqual([
      { label: '待付款', count: 0 },
      { label: '待发货', count: 1 },
      { label: '已发货', count: 0 },
      { label: '已完成', count: 0 },
      { label: '已取消', count: 2 },
    ])
  })

  it('excludes cancelled orders and subtracts successful refunds once', () => {
    const result = calculateNetSales(
      [
        { order_id: 'active', status: 30, pay_amount: 418000, create_time: 1 },
        { order_id: 'done', status: 100, pay_amount: 119100, create_time: 1 },
        { order_id: 'refunded', status: 200, pay_amount: 29900, create_time: 1 },
        { order_id: 'cancelled', status: 250, pay_amount: 89700, create_time: 1 },
      ],
      [{ order_id: 'refunded', status: 'MERCHANT_REFUND_SUCCESS', amount: 29900 }],
    )

    expect(result.gmv).toBe(537100)
    expect(result.gross).toBe(567000)
    expect(result.refund).toBe(29900)
    expect(result.deduction).toBe(119600)
    expect(result.count).toBe(4)
    expect(result.transactionCount).toBe(3)
    expect(result.effectiveCount).toBe(2)
  })

  it('subtracts a successful refund while the order is still shipped', () => {
    const result = calculateNetSales(
      [{ order_id: 'shipped', status: 30, pay_amount: 179400, create_time: 1 }],
      [{ order_id: 'shipped', status: 'MERCHANT_REFUND_SUCCESS', amount: 29900 }],
    )

    expect(result.gmv).toBe(149500)
  })

  it('allows net sales to go negative when refunds exceed gross sales', () => {
    const result = calculateNetSales(
      [{ order_id: 'old-refund-today', status: 30, pay_amount: 10000, create_time: 1 }],
      [{ order_id: 'old-order', status: 'MERCHANT_REFUND_SUCCESS', amount: 29900 }],
    )

    expect(result.gmv).toBe(-19900)
    expect(result.refund).toBe(29900)
  })

  it('shows refund on the aftersale date, not the order date in trends', () => {
    const entries = buildDailySales(
      [{ order_id: 'refunded', status: 200, pay_amount: 29900, create_time: 1781539200 }],
      [
        {
          id: 'refund-1',
          order_id: 'refunded',
          status: 'MERCHANT_REFUND_SUCCESS',
          amount: 29900,
          create_time: 1781625600,
        },
      ],
    )

    expect(entries).toEqual([
      { date: '06-16', gmv: 29900, orders: 1 },
      { date: '06-17', gmv: -29900, orders: 0 },
    ])
  })

  it('shows refund-only days as negative daily net sales', () => {
    const entries = buildDailySales(
      [],
      [
        {
          id: 'refund-1',
          order_id: 'old-order',
          status: 'MERCHANT_REFUND_SUCCESS',
          amount: 29900,
          create_time: 1781625600,
        },
      ],
    )

    expect(entries).toEqual([{ date: '06-17', gmv: -29900, orders: 0 }])
  })

  it('keeps legitimate fast refunds and deduplicates by aftersale id', () => {
    const result = normalizeAftersales([
      {
        id: 'refund-1',
        status: 'MERCHANT_REFUND_SUCCESS',
        amount: 100,
        create_time: 100,
        complete_time: 110,
      },
      {
        id: 'refund-1',
        status: 'MERCHANT_REFUND_SUCCESS',
        amount: 100,
        create_time: 100,
        complete_time: 110,
      },
      {
        id: 'refund-2',
        status: 'MERCHANT_REFUND_SUCCESS',
        amount: 100,
        create_time: 100,
        complete_time: 180,
      },
    ])

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.id)).toEqual(['refund-1', 'refund-2'])
  })
})
