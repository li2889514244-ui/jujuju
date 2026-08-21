import { describe, it, expect } from 'vitest'
import { getPlatformColor, getPlatformLabel, getPlatformChar } from '@/composables/usePlatform'
import { PLATFORM_COLORS } from '@/constants/platform'

describe('usePlatform', () => {
  it('gets douyin color', () => {
    expect(getPlatformColor('douyin')).toBe(PLATFORM_COLORS.douyin)
  })
  it('gets xiaohongshu color', () => {
    expect(getPlatformColor('xiaohongshu')).toBe(PLATFORM_COLORS.xiaohongshu)
  })
  it('handles uppercase', () => {
    expect(getPlatformColor('DOUYIN')).toBe(PLATFORM_COLORS.douyin)
  })
  it('handles unknown platform', () => {
    expect(getPlatformColor('unknown')).toBe(PLATFORM_COLORS.default)
  })
  it('aliases tencent to video_account', () => {
    expect(getPlatformColor('tencent')).toBe(PLATFORM_COLORS.video_account)
  })

  it('gets label', () => {
    expect(getPlatformLabel('douyin')).toBe('抖音')
  })
  it('gets char', () => {
    expect(getPlatformChar('xiaohongshu')).toBe('红')
  })
})
