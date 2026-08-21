import { Module, Global } from '@nestjs/common'
import { TenantContext } from './tenant-context'
import { TenantMiddleware } from './tenant.middleware'
import { TenantInterceptor } from './tenant.interceptor'

@Global()
@Module({
  providers: [TenantContext, TenantMiddleware, TenantInterceptor],
  exports: [TenantContext, TenantMiddleware, TenantInterceptor],
})
export class TenantModule {}
