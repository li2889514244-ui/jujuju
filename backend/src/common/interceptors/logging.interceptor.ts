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

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
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
