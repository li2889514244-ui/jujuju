import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import {
  MONTH_PATTERN,
  currentMonth,
  daysRemainingForMonth,
  isCurrentMonth,
  isFutureMonth,
  isValidMonth,
  monthLabel,
  monthRange,
  normalizeMonthParam,
  shiftMonth,
} from '@/utils/monthRange'

const sepFirst = new Date(2026, 8, 1, 10, 0, 0) // 2026-09-01 10:00 本地时间

describe('monthRange 基础', () => {
  it('校验 YYYY-MM 格式', () => {
    expect(isValidMonth('2026-08')).toBe(true)
    expect(isValidMonth('2026-8')).toBe(false)
    expect(isValidMonth('2026-13')).toBe(false)
    expect(isValidMonth('2026/08')).toBe(false)
    expect(isValidMonth('')).toBe(false)
    expect(MONTH_PATTERN.test('2025-12')).toBe(true)
  })

  it('2026-09-01 当天默认当前自然月', () => {
    expect(currentMonth(sepFirst)).toBe('2026-09')
    expect(isCurrentMonth('2026-09', sepFirst)).toBe(true)
    expect(isCurrentMonth('2026-08', sepFirst)).toBe(false)
  })

  it('月份范围覆盖整月（含月末最后一秒）', () => {
    const range = monthRange('2026-08')
    expect(range.start).toBe(dayjs('2026-08-01').unix())
    expect(range.end).toBe(dayjs('2026-08-31').endOf('day').unix())
  })

  it('闰年 2024-02 范围正确', () => {
    const range = monthRange('2024-02')
    expect(range.end).toBe(dayjs('2024-02-29').endOf('day').unix())
  })
})

describe('月份切换（箭头/跨年）', () => {
  it('左箭头：2026-09 -> 2026-08', () => {
    expect(shiftMonth('2026-09', -1)).toBe('2026-08')
  })

  it('跨年：2026-01 -> 2025-12', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('右箭头：2025-12 -> 2026-01', () => {
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
  })

  it('未来月份可识别，右箭头不能进入未来月', () => {
    expect(isFutureMonth('2026-10', sepFirst)).toBe(true)
    expect(isFutureMonth('2026-09', sepFirst)).toBe(false)
  })

  it('label 展示：2026-08 -> 2026年08月', () => {
    expect(monthLabel('2026-08')).toBe('2026年08月')
  })
})

describe('URL month 参数', () => {
  it('?month=2026-08 解析为 2026-08', () => {
    expect(normalizeMonthParam('2026-08', sepFirst)).toBe('2026-08')
  })

  it('无 month 参数默认当前月（返回 null 由调用方回落）', () => {
    expect(normalizeMonthParam(undefined, sepFirst)).toBeNull()
    expect(normalizeMonthParam(null, sepFirst)).toBeNull()
  })

  it('未来月份参数被拒绝（回落当前月）', () => {
    expect(normalizeMonthParam('2026-10', sepFirst)).toBeNull()
    expect(normalizeMonthParam('2027-01', sepFirst)).toBeNull()
  })

  it('非法格式参数被拒绝', () => {
    expect(normalizeMonthParam('abc', sepFirst)).toBeNull()
    expect(normalizeMonthParam('202608', sepFirst)).toBeNull()
  })

  it('跨年历史参数可解析：2025-12', () => {
    expect(normalizeMonthParam('2025-12', sepFirst)).toBe('2025-12')
  })
})

describe('剩余天数（当前月 vs 历史月）', () => {
  it('当前月：按今天到月底计算剩余天数', () => {
    // 2026-09-01 → 9月共30天，剩余30天
    expect(daysRemainingForMonth('2026-09', sepFirst)).toBe(30)
    // 月末最后一天至少剩1天
    expect(daysRemainingForMonth('2026-09', new Date(2026, 8, 30, 23, 0, 0))).toBe(1)
  })

  it('历史月：不再计算剩余天数（返回 null），避免用“今天”错误计算', () => {
    expect(daysRemainingForMonth('2026-08', sepFirst)).toBeNull()
    expect(daysRemainingForMonth('2025-12', sepFirst)).toBeNull()
  })
})
