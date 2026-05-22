export interface PlatformMeta {
  label: string
  color: string
  char: string
}

const PLATFORM_META: Record<string, PlatformMeta> = {
  douyin: { label: '抖音', color: '#00d4ff', char: '抖' },
  kuaishou: { label: '快手', color: '#ff6b35', char: '快' },
  xiaohongshu: { label: '小红书', color: '#ff3366', char: '红' },
  video_account: { label: '视频号', color: '#00e396', char: '视' },
  bilibili: { label: 'B站', color: '#fb7299', char: 'B' },
  weibo: { label: '微博', color: '#ffb800', char: '微' },
  tiktok: { label: 'TikTok', color: '#7c3aed', char: 'T' },
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

export function getPlatformColor(platform: string): string {
  return PLATFORM_META[normalizeKey(platform)]?.color || '#6e6e73'
}

export function getPlatformLabel(platform: string): string {
  return PLATFORM_META[normalizeKey(platform)]?.label || platform
}

export function getPlatformChar(platform: string): string {
  return PLATFORM_META[normalizeKey(platform)]?.char || '?'
}

export function getPlatformMeta(platform: string): PlatformMeta {
  return PLATFORM_META[normalizeKey(platform)] || { label: platform, color: '#6e6e73', char: '?' }
}
