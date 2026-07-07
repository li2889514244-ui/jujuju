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
    expect(result.count).toBe(4)
    expect(result.transactionCount).toBe(3)
    expect(result.effectiveCount).toBe(2)
  })

  it('uses product_price for gross when available (matches official platform)', () => {
    const result = calculateNetSales(
      [
        { order_id: 'o1', status: 30, pay_amount: 26900, product_price: 29900, create_time: 1 },
        { order_id: 'o2', status: 100, pay_amount: 29900, product_price: 29900, create_time: 1 },
        { order_id: 'o3', status: 200, pay_amount: 28400, product_price: 29900, create_time: 1 },
      ],
      [],
    )

    // gross = 3 × 29900 = 89700 (product_price, not pay_amount)
    expect(result.gross).toBe(89700)
    expect(result.transactionCount).toBe(3)
    expect(result.effectiveCount).toBe(2)
  })

  it('only counts refunds for orders in the current scope (same-day orders)', () => {
    const result = calculateNetSales(
      [
        { order_id: 'today-1', status: 30, pay_amount: 29900, create_time: 1 },
        { order_id: 'today-2', status: 200, pay_amount: 29900, create_time: 1 },
      ],
      [
        // Refund for today's order - should be counted
        { order_id: 'today-2', status: 'MERCHANT_REFUND_SUCCESS', amount: 29900 },
        // Refund for an old order not in scope - should NOT be counted
        { order_id: 'old-order', status: 'MERCHANT_REFUND_SUCCESS', amount: 29900 },
      ],
    )

    expect(result.refund).toBe(29900)
    expect(result.gross).toBe(59800)
    expect(result.gmv).toBe(29900)
  })

  it('subtracts a successful refund while the order is still shipped', () => {
    const result = calculateNetSales(
      [{ order_id: 'shipped', status: 30, pay_amount: 179400, create_time: 1 }],
      [{ order_id: 'shipped', status: 'MERCHANT_REFUND_SUCCESS', amount: 29900 }],
    )

    expect(result.gmv).toBe(149500)
  })

  it('matches refund to order date in daily trends', () => {
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

    // Refund is attributed to the order's date (06-16), not the aftersale date (06-17)
    expect(entries).toEqual([{ date: '06-16', gmv: 0, orders: 1 }])
  })

  it('skips refunds for orders outside the dataset in daily trends', () => {
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

    // No matching order, so refund is not counted
    expect(entries).toEqual([])
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
