import {
  normalizePlatformKey,
  PLATFORM_COLORS,
  PLATFORM_META,
  type PlatformMeta,
} from '@/constants/platform'

/** Get brand color for a platform. Uses PLATFORM_COLORS as single source of truth. */
export function getPlatformColor(platform: string): string {
  const key = normalizePlatformKey(platform)
  return PLATFORM_COLORS[key] || PLATFORM_COLORS.default || '#8a8078'
}

export function getPlatformLabel(platform: string): string {
  return PLATFORM_META[normalizePlatformKey(platform)]?.label || platform
}

export function getPlatformChar(platform: string): string {
  return PLATFORM_META[normalizePlatformKey(platform)]?.char || '?'
}

export function getPlatformMeta(platform: string): PlatformMeta {
  return (
    PLATFORM_META[normalizePlatformKey(platform)] || {
      label: platform,
      color: '#8a8078',
      char: '?',
    }
  )
}

/** Map notification type to accent-palette semantic color. */
export function getNotificationColor(type: string): string {
  switch (type) {
    case 'PUBLISH_FAILED':
    case 'ACCOUNT_EXPIRED':
      return '#d4534a' // rust / danger
    case 'PUBLISH_SUCCESS':
      return '#6b9e6c' // sage / success
    case 'FOLLOWER_ALERT':
    case 'DATA_ANOMALY':
      return '#e0a030' // gold / warning
    default:
      return '#8a8078' // taupe / info
  }
}
