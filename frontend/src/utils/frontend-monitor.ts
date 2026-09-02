import type { App, ComponentPublicInstance } from 'vue'

type FrontendSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'

interface FrontendEventPayload {
  eventType: string
  severity?: FrontendSeverity
  errorCode?: string
  message?: string
  name?: string
  stackTop?: string
  stackFingerprint?: string
  component?: string
  info?: string
  route?: string
  apiUrl?: string
  resourceTag?: string
  resourceUrl?: string
  statusCode?: number
  businessCode?: number
  durationMs?: number
  requestId?: string
  occurredAt?: string
}

interface ApiFailureInput {
  url?: string
  method?: string
  statusCode?: number
  businessCode?: number
  durationMs?: number
  requestId?: string
  message?: string
}

const DEDUPE_WINDOW_MS = 30_000
const recentFingerprints = new Map<string, number>()

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function installFrontendMonitoring(app: App) {
  const previousHandler = app.config.errorHandler
  app.config.errorHandler = (err: unknown, instance: ComponentPublicInstance | null, info: string) => {
    reportFrontendError('VUE_ERROR', err, {
      component: instance?.$options?.name || instance?.$?.type?.name || '',
      info,
    })
    previousHandler?.(err, instance, info)
    if (!previousHandler) {
      console.error('[Vue Global Error]', err)
    }
  }

  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as HTMLElement | null
      if (target && 'tagName' in target) {
        const resource = resourceInfo(target)
        reportFrontendEvent({
          eventType: 'RESOURCE_ERROR',
          severity: 'WARNING',
          errorCode: `RESOURCE_${resource.tag}`,
          message: resource.url ? `${resource.tag} load failed: ${resource.url}` : `${resource.tag} load failed`,
          resourceTag: resource.tag,
          resourceUrl: resource.url,
          route: currentRoute(),
        })
        return
      }
      if (isIgnoredBrowserNoise(event.error || event.message)) return
      reportFrontendError('JS_ERROR', event.error || event.message)
    },
    true,
  )

  window.addEventListener('unhandledrejection', (event) => {
    reportFrontendError('UNHANDLED_REJECTION', event.reason)
  })
}

export function reportFrontendError(
  eventType: string,
  error: unknown,
  extra: Partial<FrontendEventPayload> = {},
) {
  if (isIgnoredBrowserNoise(error)) return
  const errorObject = error instanceof Error ? error : new Error(stringifyError(error))
  const stackTop = trimStack(errorObject.stack)
  reportFrontendEvent({
    eventType,
    severity: 'ERROR',
    errorCode: `${eventType}_${hash(`${errorObject.name}:${stackTop || errorObject.message}`).slice(0, 8)}`,
    message: errorObject.message,
    name: errorObject.name,
    stackTop,
    stackFingerprint: hash(stackTop || errorObject.message),
    route: currentRoute(),
    ...extra,
  })
}

function isIgnoredBrowserNoise(error: unknown): boolean {
  const message = error instanceof Error ? error.message : stringifyError(error)
  return /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(message)
}

export function reportApiFailure(input: ApiFailureInput) {
  const statusCode = input.statusCode || 0
  const eventType = statusCode >= 500 ? 'API_5XX' : statusCode >= 400 ? 'API_4XX' : 'API_ERROR'
  const errorCode = statusCode >= 400 || statusCode === 0 ? `API_${statusCode || 'NETWORK'}` : 'API_BUSINESS_ERROR'
  reportFrontendEvent({
    eventType,
    severity: statusCode >= 500 || statusCode === 0 ? 'ERROR' : 'WARNING',
    errorCode,
    message: input.message || 'API request failed',
    apiUrl: sanitizeUrl(input.url || ''),
    statusCode,
    businessCode: input.businessCode,
    durationMs: input.durationMs,
    requestId: input.requestId,
    route: currentRoute(),
  })
}

export function reportFrontendEvent(payload: FrontendEventPayload) {
  const token = readToken()
  if (!token) return

  const safePayload = sanitizePayload({
    frontendVersion: (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : import.meta.env.VITE_APP_VERSION) || '1.0.0',
    userAgent: navigator.userAgent,
    occurredAt: new Date().toISOString(),
    route: currentRoute(),
    ...payload,
  })
  const fingerprint = [
    safePayload.eventType,
    safePayload.errorCode,
    safePayload.route,
    safePayload.stackFingerprint,
    safePayload.apiUrl,
  ]
    .filter(Boolean)
    .join('|')

  if (isDuplicated(fingerprint)) return

  const url = `${apiBaseUrl()}/system-health/frontend-events`
  void fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Request-Id': String(safePayload.requestId || createRequestId()),
    },
    body: JSON.stringify(safePayload),
    keepalive: true,
  }).catch(() => undefined)
}

function readToken(): string {
  try {
    const raw = localStorage.getItem('matrixflow-user')
    if (!raw) return ''
    const parsed = JSON.parse(raw) as { token?: string }
    return typeof parsed.token === 'string' ? parsed.token : ''
  } catch {
    return ''
  }
}

function apiBaseUrl(): string {
  return String(import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
}

function currentRoute(): string {
  return sanitizeUrl(`${window.location.pathname}${window.location.search}`)
}

function sanitizeUrl(value: string): string {
  if (!value) return ''
  try {
    const url = new URL(value, window.location.origin)
    return url.pathname.replace(/\/[A-Za-z0-9_-]{16,}/g, '/:id')
  } catch {
    return value.split('?')[0].slice(0, 180)
  }
}

function resourceInfo(target: HTMLElement): { tag: string; url: string } {
  const tag = target.tagName || 'RESOURCE'
  const raw =
    target instanceof HTMLImageElement
      ? target.currentSrc || target.src
      : target instanceof HTMLLinkElement
        ? target.href
        : target instanceof HTMLScriptElement
          ? target.src
          : ''
  return { tag, url: sanitizeUrl(raw) }
}

function sanitizePayload(payload: FrontendEventPayload & Record<string, unknown>) {
  const result: Record<string, string | number | undefined> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (/password|token|cookie|secret|authorization/i.test(key)) continue
    if (typeof value === 'string') {
      result[key] = value
        .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***')
        .replace(/(token|password|cookie|secret)=([^&\s]+)/gi, '$1=***')
        .slice(0, 800)
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = value
    }
  }
  return result
}

function isDuplicated(fingerprint: string): boolean {
  const now = Date.now()
  const previous = recentFingerprints.get(fingerprint) || 0
  recentFingerprints.set(fingerprint, now)
  for (const [key, time] of recentFingerprints.entries()) {
    if (now - time > DEDUPE_WINDOW_MS * 4) recentFingerprints.delete(key)
  }
  return now - previous < DEDUPE_WINDOW_MS
}

function trimStack(stack?: string): string {
  return (stack || '')
    .split('\n')
    .slice(0, 4)
    .map((line) => line.replace(window.location.origin, ''))
    .join('\n')
    .slice(0, 800)
}

function stringifyError(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || 'Unknown error')
  }
  return 'Unknown error'
}

function hash(value: string): string {
  let result = 5381
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 33) ^ value.charCodeAt(index)
  }
  return (result >>> 0).toString(16)
}
