import { AsyncLocalStorage } from 'async_hooks'
import { Injectable } from '@nestjs/common'

export interface TenantContextData {
  organizationId: string | null
  isSuperAdmin: boolean
}

/**
 * 请求级别的组织上下文（原租户上下文）
 * 使用 AsyncLocalStorage 在整个请求生命周期中传递 organizationId
 * Prisma middleware 会读取此上下文自动注入 where/data 条件
 */
@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantContextData>()

  /**
   * 在请求中间件中调用，设置当前组织上下文
   */
  run<T>(data: TenantContextData, fn: () => T): T {
    return this.storage.run(data, fn)
  }

  /**
   * 获取当前请求的组织 ID
   * 返回 null 表示：未设置（如 SUPER_ADMIN 操作、或公共端点）
   */
  getTenantId(): string | null {
    const store = this.storage.getStore()
    return store?.organizationId ?? null
  }

  /**
   * 当前请求是否为超级管理员
   */
  isSuperAdmin(): boolean {
    const store = this.storage.getStore()
    return store?.isSuperAdmin ?? false
  }

  /**
   * 是否应该注入组织过滤条件
   * SUPER_ADMIN 且未绑定组织时不注入（可跨组织操作）
   */
  shouldEnforceTenant(): boolean {
    return this.getTenantId() !== null
  }
}
