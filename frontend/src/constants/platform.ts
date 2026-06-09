export interface PlatformMeta {
  label: string
  color: string
  char: string
}

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
  default: '#6366f1',
}

export const PLATFORM_LABELS = {
  douyin: '抖音',
  kuaishou: '快手',
  xiaohongshu: '小红书',
  video_account: '视频号',
  bilibili: 'B站',
  weibo: '微博',
  tiktok: 'TikTok',
  doudian: '抖店',
  xiaohongshu_shop: '小红书商家',
  wechat_shop: '微信小店',
} as const

const PLATFORM_CHARS: Record<string, string> = {
  douyin: '抖',
  kuaishou: '快',
  xiaohongshu: '红',
  video_account: '视',
  bilibili: 'B',
  weibo: '微',
  tiktok: 'T',
  doudian: '店',
  xiaohongshu_shop: '商',
  wechat_shop: '微',
}

export const PLATFORM_ALIASES: Record<string, string> = {
  wechat_video: 'video_account',
  tencent: 'video_account',
  shipinhao: 'video_account',
}

export const PLATFORM_META: Record<string, PlatformMeta> = Object.fromEntries(
  Object.entries(PLATFORM_LABELS).map(([key, label]) => [
    key,
    {
      label,
      color: PLATFORM_COLORS[key] || PLATFORM_COLORS.default,
      char: PLATFORM_CHARS[key] || '?',
    },
  ]),
) as Record<string, PlatformMeta>

export function normalizePlatformKey(platform: string): string {
  const lower = platform.toLowerCase().trim()
  return PLATFORM_ALIASES[lower] || lower
}
