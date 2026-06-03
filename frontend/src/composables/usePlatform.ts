export interface PlatformMeta {
  label: string
  color: string
  char: string
}

// Single source of truth for ALL platform brand colors
export const PLATFORM_COLORS: Record<string, string> = {
  douyin: '#111111',
  kuaishou: '#FF4906',
  xiaohongshu: '#FF2442',
  bilibili: '#FB7299',
  weibo: '#E6162D',
  video_account: '#07C160',
  tiktok: '#000000',
  doudian: '#FF7700',
  xiaohongshu_shop: '#FF2442',
  wechat_shop: '#07C160',
  default: '#00cc99',
}

const PLATFORM_META: Record<string, PlatformMeta> = {
  douyin: { label: '抖音', color: PLATFORM_COLORS.douyin, char: '抖' },
  kuaishou: { label: '快手', color: PLATFORM_COLORS.kuaishou, char: '快' },
  xiaohongshu: { label: '小红书', color: PLATFORM_COLORS.xiaohongshu, char: '红' },
  video_account: { label: '视频号', color: PLATFORM_COLORS.video_account, char: '视' },
  bilibili: { label: 'B站', color: PLATFORM_COLORS.bilibili, char: 'B' },
  weibo: { label: '微博', color: PLATFORM_COLORS.weibo, char: '微' },
  tiktok: { label: 'TikTok', color: PLATFORM_COLORS.tiktok, char: 'T' },
  doudian: { label: '抖店', color: PLATFORM_COLORS.doudian, char: '店' },
  xiaohongshu_shop: { label: '小红书商家', color: PLATFORM_COLORS.xiaohongshu_shop, char: '商' },
  wechat_shop: { label: '微信小店', color: PLATFORM_COLORS.wechat_shop, char: '微' },
}

const ALIASES: Record<string, string> = {
  wechat_video: 'video_account',
  tencent: 'video_account',
  shipinhao: 'video_account',
}

function normalizeKey(platform: string): string {
  const lower = platform.toLowerCase().trim()
  return ALIASES[lower] || lower
}

/** Get brand color for a platform. Uses PLATFORM_COLORS as single source of truth. */
export function getPlatformColor(platform: string): string {
  const key = normalizeKey(platform)
  return PLATFORM_COLORS[key] || PLATFORM_COLORS.default || '#8a8078'
}

export function getPlatformLabel(platform: string): string {
  return PLATFORM_META[normalizeKey(platform)]?.label || platform
}

export function getPlatformChar(platform: string): string {
  return PLATFORM_META[normalizeKey(platform)]?.char || '?'
}

export function getPlatformMeta(platform: string): PlatformMeta {
  return PLATFORM_META[normalizeKey(platform)] || { label: platform, color: '#8a8078', char: '?' }
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
