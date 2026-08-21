function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return atob(padded)
}

export function readJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3 || !parts[1]) return null
    const decoded = JSON.parse(decodeBase64Url(parts[1]))
    return decoded && typeof decoded === 'object' ? decoded : null
  } catch {
    return null
  }
}

export function isJwtExpiringWithin(token: string, marginSeconds: number): boolean {
  const payload = readJwtPayload(token)
  const exp = Number(payload?.exp || 0)
  if (!exp) return false
  return exp < Math.floor(Date.now() / 1000) + marginSeconds
}
