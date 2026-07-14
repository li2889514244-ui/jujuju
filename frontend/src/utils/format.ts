export function tokenStatusLabel(row: { tokenStatus?: string; hasCookies?: boolean }): string {
  if (row.tokenStatus === 'valid') return '已连接'
  if (row.tokenStatus === 'expiring_soon') return '即将过期'
  if (row.tokenStatus === 'expired') return '已失效'
  if (row.hasCookies) return '在线'
  return '待授权'
}

export function formatLargeNum(num: number): string {
  if (num >= 100000000) return (num / 100000000).toFixed(1) + '亿'
  if (num >= 10000) return (num / 10000).toFixed(1) + '万'
  if (num === 0) return '0'
  return num.toLocaleString()
}

export function formatCompactNum(num: number): string {
  if (num >= 10000) return (num / 10000).toFixed(1) + 'w'
  return num?.toLocaleString() || '0'
}
