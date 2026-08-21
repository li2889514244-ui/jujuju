const SENSITIVE_QUERY_KEYS = [
  'token',
  'code',
  'state',
  'password',
  'secret',
  'key',
  'authorization',
]

export function sanitizeUrl(url: string): string {
  try {
    const [path, queryString] = url.split('?')
    if (!queryString) return url

    const params = new URLSearchParams(queryString)
    for (const key of params.keys()) {
      if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
        params.set(key, '***')
      }
    }
    return `${path}?${params.toString()}`
  } catch {
    return url
  }
}
