import { describe, it, expect } from 'vitest'
import { formatLargeNum, formatCompactNum, tokenStatusLabel } from '@/utils/format'

describe('formatLargeNum', () => {
  it('formats billions', () => {
    expect(formatLargeNum(123456789)).toBe('1.2亿')
  })
  it('formats ten-thousands', () => {
    expect(formatLargeNum(12345)).toBe('1.2万')
  })
  it('formats zero', () => {
    expect(formatLargeNum(0)).toBe('0')
  })
  it('formats small numbers', () => {
    expect(formatLargeNum(999)).toBe('999')
  })
})

describe('formatCompactNum', () => {
  it('formats ten-thousands', () => {
    expect(formatCompactNum(12345)).toBe('1.2w')
  })
  it('formats small numbers', () => {
    expect(formatCompactNum(999)).toBe('999')
  })
  it('handles zero', () => {
    expect(formatCompactNum(0)).toBe('0')
  })
})

describe('tokenStatusLabel', () => {
  it('returns 已连接 for valid', () => {
    expect(tokenStatusLabel({ tokenStatus: 'valid' })).toBe('已连接')
  })
  it('returns 即将过期 for expiring_soon', () => {
    expect(tokenStatusLabel({ tokenStatus: 'expiring_soon' })).toBe('即将过期')
  })
  it('returns 已失效 for expired', () => {
    expect(tokenStatusLabel({ tokenStatus: 'expired' })).toBe('已失效')
  })
  it('returns 在线 for hasCookies', () => {
    expect(tokenStatusLabel({ hasCookies: true })).toBe('在线')
  })
  it('returns 待授权 for unknown', () => {
    expect(tokenStatusLabel({})).toBe('待授权')
  })
})
