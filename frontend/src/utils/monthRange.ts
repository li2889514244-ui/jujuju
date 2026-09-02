import dayjs from 'dayjs'

/**
 * 业绩天梯月度工具：以 'YYYY-MM' 字符串作为页面统一月份参数。
 * 所有数据请求（订单/快照）与所有“剩余天数/剩余日均”计算都必须基于该参数。
 */

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isValidMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value)
}

/** 当前自然月（本地时区），格式 YYYY-MM */
export function currentMonth(now: Date = new Date()): string {
  return dayjs(now).format('YYYY-MM')
}

/**
 * 解析 URL 上的 month 参数。
 * 非法格式、或未来月份返回 null，由调用方回落到当前自然月。
 */
export function normalizeMonthParam(value: unknown, now: Date = new Date()): string | null {
  if (!isValidMonth(value)) return null
  const current = currentMonth(now)
  return value > current ? null : value
}

/** 该自然月完整时间范围（unix 秒，闭区间），用于订单/售后接口 start_time/end_time */
export function monthRange(month: string): { start: number; end: number } {
  const base = dayjs(`${month}-01`)
  return {
    start: base.startOf('month').unix(),
    end: base.endOf('month').unix(),
  }
}

/** 向前/向后平移自然月，例如 shiftMonth('2026-01', -1) === '2025-12' */
export function shiftMonth(month: string, delta: number): string {
  return dayjs(`${month}-01`).add(delta, 'month').format('YYYY-MM')
}

/** '2026-08' -> '2026年08月' */
export function monthLabel(month: string): string {
  return dayjs(`${month}-01`).format('YYYY年MM月')
}

/** '2026-08' -> '8月' */
export function monthShortLabel(month: string): string {
  return dayjs(`${month}-01`).format('M月')
}

export function monthYear(month: string): number {
  return Number(month.slice(0, 4))
}

/** 1-12 */
export function monthIndex(month: string): number {
  return Number(month.slice(5, 7))
}

export function isFutureMonth(month: string, now: Date = new Date()): boolean {
  return month > currentMonth(now)
}

export function isCurrentMonth(month: string, now: Date = new Date()): boolean {
  return month === currentMonth(now)
}

/**
 * 剩余天数：只有当前自然月才有意义（从今天算到月底，至少 1 天）。
 * 历史月返回 null —— 已结束的月份不再计算“剩余天数/剩余日均”，
 * 防止出现“查看8月却按今天计算剩余日均”的错误。
 */
export function daysRemainingForMonth(month: string, now: Date = new Date()): number | null {
  if (month !== currentMonth(now)) return null
  const today = dayjs(now).startOf('day')
  const monthEnd = dayjs(`${month}-01`).endOf('month')
  return Math.max(1, monthEnd.diff(today, 'day') + 1)
}
