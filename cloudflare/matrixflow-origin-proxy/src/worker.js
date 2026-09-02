const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]

const STATIC_ASSET_PREFIX = '/assets/'
const STATIC_ASSET_TTL_SECONDS = 30 * 24 * 60 * 60
const DOWNLOAD_PREFIX = '/downloads/'
const COMPANION_UPDATE_PREFIX = '/companion-updates/'
const DOWNLOAD_TTL_SECONDS = 24 * 60 * 60
const UPLOADS_PREFIX = '/uploads/'
const UPLOADS_TTL_SECONDS = 24 * 60 * 60
// SPA 页面（index.html 及所有前端路由）：边缘缓存 5 分钟，卸载源站压力；
// 每次前端部署后 publish 脚本会主动 purge，确保用户尽快看到新版本。
const HTML_TTL_SECONDS = 5 * 60
const EXCLUDED_FROM_HTML_CACHE = [
  STATIC_ASSET_PREFIX,
  DOWNLOAD_PREFIX,
  COMPANION_UPDATE_PREFIX,
  UPLOADS_PREFIX,
  '/api/',
  '/ws/',
]

function isStaticAssetRequest(request) {
  const url = new URL(request.url)
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    url.pathname.startsWith(STATIC_ASSET_PREFIX)
  )
}

function isDownloadRequest(request) {
  const url = new URL(request.url)
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    url.pathname.startsWith(DOWNLOAD_PREFIX)
  )
}

function isMutableDownloadRequest(request) {
  if (!isDownloadRequest(request)) {
    return false
  }
  const filename = new URL(request.url).pathname.split('/').pop() || ''
  return (
    filename === 'pixingyun-mate-setup.exe' ||
    filename === 'pixingyun-mate-setup-latest.exe' ||
    filename === 'pixingyun-mate-portable.zip' ||
    filename === 'pixingyun-mate-portable.exe'
  )
}

function isCompanionUpdateRequest(request) {
  const url = new URL(request.url)
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    url.pathname.startsWith(COMPANION_UPDATE_PREFIX)
  )
}

function isApiRequest(request) {
  const url = new URL(request.url)
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')
}

function isUploadsRequest(request) {
  const url = new URL(request.url)
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    url.pathname.startsWith(UPLOADS_PREFIX)
  )
}

function isHtmlPageRequest(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }
  if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
    return false
  }
  const url = new URL(request.url)
  return !EXCLUDED_FROM_HTML_CACHE.some((prefix) => url.pathname.startsWith(prefix))
}

function buildOriginRequest(request, env, options = {}) {
  const incomingUrl = new URL(request.url)
  const originUrl = new URL(request.url)
  originUrl.protocol = env.ORIGIN_PROTOCOL || 'http:'
  originUrl.hostname = env.ORIGIN_HOST || incomingUrl.hostname
  originUrl.port = ''
  if (options.bustCache) {
    originUrl.searchParams.set('__matrixflow_bypass', Date.now().toString())
  }

  const isWebSocket = request.headers.get('upgrade')?.toLowerCase() === 'websocket'
  const headers = new Headers(request.headers)
  headers.delete('host')
  if (!isWebSocket) {
    for (const header of HOP_BY_HOP_HEADERS) {
      headers.delete(header)
    }
  }
  if (options.publicStaticAsset) {
    headers.delete('authorization')
    headers.delete('cookie')
  }
  headers.set('x-forwarded-host', incomingUrl.host)
  headers.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''))

  return new Request(originUrl.toString(), {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  })
}

function buildCfOptions(request, env, originRequest) {
  const cf = {}
  if (env.ORIGIN_RESOLVE_HOST) {
    cf.resolveOverride = env.ORIGIN_RESOLVE_HOST
  }

  if (isStaticAssetRequest(request)) {
    cf.cacheEverything = true
    cf.cacheTtl = STATIC_ASSET_TTL_SECONDS
    cf.cacheTtlByStatus = {
      '200-299': STATIC_ASSET_TTL_SECONDS,
      404: 60,
      '500-599': 0,
    }
    cf.cacheKey = originRequest.url
    return cf
  }

  if (isUploadsRequest(request)) {
    cf.cacheEverything = true
    cf.cacheTtl = UPLOADS_TTL_SECONDS
    cf.cacheTtlByStatus = {
      '200-299': UPLOADS_TTL_SECONDS,
      404: 60,
      '500-599': 0,
    }
    cf.cacheKey = originRequest.url
    return cf
  }

  if (isHtmlPageRequest(request)) {
    cf.cacheEverything = true
    cf.cacheTtl = HTML_TTL_SECONDS
    cf.cacheTtlByStatus = {
      '200-299': HTML_TTL_SECONDS,
      404: 0,
      '500-599': 0,
    }
    cf.cacheKey = originRequest.url
    return cf
  }

  if (isMutableDownloadRequest(request)) {
    cf.cacheTtl = 0
    return cf
  }

  if (isCompanionUpdateRequest(request)) {
    cf.cacheTtl = 0
    return cf
  }

  if (isDownloadRequest(request)) {
    cf.cacheEverything = true
    cf.cacheTtl = DOWNLOAD_TTL_SECONDS
    cf.cacheTtlByStatus = {
      '200-299': DOWNLOAD_TTL_SECONDS,
      404: 60,
      '500-599': 0,
    }
    cf.cacheKey = originRequest.url
    return cf
  }

  cf.cacheTtl = 0
  return cf
}

function rewriteLocation(response, publicUrl) {
  const location = response.headers.get('location')
  if (!location) {
    return response
  }

  const headers = new Headers(response.headers)
  try {
    const next = new URL(location, publicUrl)
    if (next.hostname === '8.134.218.39') {
      const current = new URL(publicUrl)
      next.protocol = current.protocol
      next.hostname = current.hostname
      next.port = ''
      headers.set('location', next.toString())
    }
  } catch {
    return response
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export default {
  async fetch(request, env) {
    const staticAsset = isStaticAssetRequest(request)
    const uploadsAsset = isUploadsRequest(request)
    const htmlPage = isHtmlPageRequest(request)
    const downloadAsset = isDownloadRequest(request)
    const mutableDownloadAsset = isMutableDownloadRequest(request)
    const companionUpdateAsset = isCompanionUpdateRequest(request)
    const apiRequest = isApiRequest(request)
    const originRequest = buildOriginRequest(request, env, {
      publicStaticAsset: staticAsset || uploadsAsset || htmlPage || downloadAsset,
      bustCache: mutableDownloadAsset || companionUpdateAsset,
    })
    const cf = buildCfOptions(request, env, originRequest)

    const response = await fetch(originRequest, { cf })

    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      return response
    }

    const finalResponse = rewriteLocation(response, request.url)
    const headers = new Headers(finalResponse.headers)
    headers.set('x-matrixflow-entry', 'cloudflare-worker')
    if (staticAsset && finalResponse.ok) {
      headers.set('cache-control', `public, max-age=${STATIC_ASSET_TTL_SECONDS}, immutable`)
      headers.set('x-matrixflow-cache-policy', 'static-assets-30d')
    } else if (mutableDownloadAsset && finalResponse.ok) {
      headers.set('cache-control', 'no-store')
      headers.set('x-matrixflow-cache-policy', 'mutable-download-no-store')
    } else if (companionUpdateAsset && finalResponse.ok) {
      headers.set('cache-control', 'no-store')
      headers.set('x-matrixflow-cache-policy', 'companion-update-no-store')
    } else if (downloadAsset && finalResponse.ok) {
      headers.set(
        'cache-control',
        `public, max-age=3600, s-maxage=${DOWNLOAD_TTL_SECONDS}, stale-while-revalidate=86400`,
      )
      headers.set('x-matrixflow-cache-policy', 'downloads-1d')
    } else if (apiRequest) {
      headers.set('cache-control', 'no-store')
      headers.set('x-matrixflow-cache-policy', 'dynamic-no-store')
    } else if (headers.get('content-type')?.toLowerCase().includes('text/html')) {
      headers.set('cache-control', 'no-cache, must-revalidate')
      headers.set('x-matrixflow-cache-policy', 'html-revalidate')
    } else {
      headers.set('x-matrixflow-cache-policy', 'pass-through')
    }

    return new Response(finalResponse.body, {
      status: finalResponse.status,
      statusText: finalResponse.statusText,
      headers,
    })
  },
}
