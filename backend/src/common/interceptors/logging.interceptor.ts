import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';

// #17 修复: URL 脱敏 — 移除 query 参数中的敏感字段
const SENSITIVE_QUERY_KEYS = ['token', 'code', 'state', 'password', 'secret', 'key', 'authorization'];

function sanitizeUrl(url: string): string {
  try {
    const [path, queryString] = url.split('?');
    if (!queryString) return url;

    const params = new URLSearchParams(queryString);
    for (const key of params.keys()) {
      if (SENSITIVE_QUERY_KEYS.includes(key.toLowerCase())) {
        params.set(key, '***');
      }
    }
    return `${path}?${params.toString()}`;
  } catch {
    return url;
  }
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, ip } = request;
    const url = sanitizeUrl(request.url);
    const userAgent = request.get('user-agent') || '';
    const userId = (request as any).user?.id || 'anonymous';
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const { statusCode } = response;
        const contentLength = response.get('content-length');
        this.logger.log(
          `${method} ${url} ${statusCode} ${contentLength || 0}B - ${Date.now() - now}ms - ${ip} - user:${userId} - ${userAgent}`,
        );
      }),
      catchError((error) => {
        const statusCode = error.getStatus?.() || 500;
        this.logger.warn(
          `${method} ${url} ${statusCode} ERROR - ${Date.now() - now}ms - ${ip} - user:${userId} - ${error.message}`,
        );
        return throwError(() => error);
      }),
    );
  }
}
