import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap, catchError } from 'rxjs/operators'
import { throwError } from 'rxjs'
import { sanitizeUrl } from '../utils/sanitize-url'

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP')

  constructor(
    private readonly systemHealth?: {
      recordBackendHttpEventSafely(input: {
        requestId?: string
        method: string
        url: string
        statusCode: number
        durationMs: number
        userId?: string | null
        organizationId?: string | null
        userAgent?: string | null
        companionVersion?: string | null
        companionDevice?: string | null
        errorName?: string | null
        errorMessage?: string | null
      }): void
    },
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const { method, ip } = request
    const url = sanitizeUrl(request.url)
    const userAgent = request.get('user-agent') || ''
    const userId = (request as any).user?.id || 'anonymous'
    const organizationId = (request as any).user?.organizationId || null
    const traceId = (request as any)['requestId'] || (request as any)['traceId'] || 'no-trace'
    // 伴侣上报请求头 + 真实客户端 IP（源站位于代理后，socket ip 恒为 127.0.0.1）
    const companionVersion = request.get('x-companion-version') || ''
    const companionDevice = request.get('x-companion-device-id') || ''
    const forwardedFor = request.get('x-forwarded-for') || ''
    const clientIp = (forwardedFor.split(',')[0] || '').trim() || ip
    const now = Date.now()

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse()
        const { statusCode } = response
        const contentLength = response.get('content-length') || 0
        const durationMs = Date.now() - now

        // 结构化日志：传入对象作为 message，JsonLogger 会自动提取字段
        this.logger.log({
          message: `${method} ${url} ${statusCode}`,
          httpMethod: method,
          httpUrl: url,
          httpStatus: statusCode,
          contentLength,
          durationMs,
          ip,
          clientIp,
          userId,
          traceId,
          userAgent,
          companionVersion,
          companionDevice,
        })
        this.systemHealth?.recordBackendHttpEventSafely({
          requestId: traceId,
          method,
          url,
          statusCode,
          durationMs,
          userId,
          organizationId,
          userAgent,
          companionVersion,
          companionDevice,
        })
      }),
      catchError((error) => {
        const statusCode = error.getStatus?.() || 500
        const durationMs = Date.now() - now

        this.logger.warn({
          message: `${method} ${url} ${statusCode} ERROR`,
          httpMethod: method,
          httpUrl: url,
          httpStatus: statusCode,
          durationMs,
          ip,
          clientIp,
          userId,
          traceId,
          userAgent,
          companionVersion,
          companionDevice,
          error: error.message,
        })
        this.systemHealth?.recordBackendHttpEventSafely({
          requestId: traceId,
          method,
          url,
          statusCode,
          durationMs,
          userId,
          organizationId,
          userAgent,
          companionVersion,
          companionDevice,
          errorName: error?.constructor?.name || 'Error',
          errorMessage: error?.message,
        })
        return throwError(() => error)
      }),
    )
  }
}
