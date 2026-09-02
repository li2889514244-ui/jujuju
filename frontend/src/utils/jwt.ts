function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  // atob 返回 latin1 二进制串；JWT payload 是 UTF-8 JSON（可能含中文），
  // 必须按 UTF-8 字节解码，否则中文 payload 字段会变成乱码。
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
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
