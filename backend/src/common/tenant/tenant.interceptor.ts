import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { TenantContext, TenantContextData } from './tenant-context'

/**
 * 全局拦截器 — 在请求处理期间设置组织上下文
 * 从 request.user（由 JWT strategy 设置）中读取 organizationId
 * 使用 AsyncLocalStorage 将 organizationId 传播到 Prisma middleware
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContext) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    const data: TenantContextData = {
      organizationId: user?.organizationId ?? null,
      isSuperAdmin: user?.role === 'SUPER_ADMIN',
    }

    // 用 AsyncLocalStorage.run 包裹整个请求处理
    // Prisma middleware 会在同一个 async chain 中读取 organizationId
    return new Observable<any>((observer) => {
      this.tenantContext.run(data, () => {
        next.handle().subscribe({
          next: (val) => observer.next(val),
          error: (err) => observer.error(err),
          complete: () => observer.complete(),
        })
      })
    })
  }
}
