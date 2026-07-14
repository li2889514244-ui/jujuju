import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { TenantContext } from './tenant-context'

/**
 * 需要进行组织隔离的模型列表
 * 不在此列表中的模型（如 Organization, AuditLog）不做自动隔离
 */
const TENANT_SCOPED_MODELS = new Set([
  'Account',
  'Post',
  'PostStats',
  'DailyStats',
  'Competitor',
  'CompetitorSnapshot',
  'AccountGroup',
  'Asset',
  'Notification',
  'PixingVideoTask',
  'CalendarEvent',
  'WechatStore',
  'DoudianStore',
])

/**
 * Prisma Middleware — 自动注入 organizationId
 *
 * 读取/更新/删除操作：自动在 where 条件中注入 organizationId
 * 创建操作：自动在 data 中注入 organizationId
 *
 * SUPER_ADMIN 不受限制（可跨组织操作）
 */
@Injectable()
export class TenantMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name)

  constructor(private readonly tenantContext: TenantContext) {}

  /**
   * 返回 Prisma middleware 函数
   */
  createMiddleware(): Prisma.Middleware {
    return async (
      params: Prisma.MiddlewareParams,
      next: (params: Prisma.MiddlewareParams) => Promise<any>,
    ) => {
      const organizationId = this.tenantContext.getTenantId()
      const isSuperAdmin = this.tenantContext.isSuperAdmin()

      // SUPER_ADMIN 无组织限制
      if (isSuperAdmin && !organizationId) {
        return next(params)
      }

      // 检查模型是否需要组织隔离
      if (!TENANT_SCOPED_MODELS.has(params.model ?? '')) {
        return next(params)
      }

      // 没有 organizationId 时不注入（兼容过渡期数据）
      if (!organizationId) {
        return next(params)
      }

      const action = params.action

      // 读操作：注入 where 条件
      if (action === 'findUnique' || action === 'findFirst' || action === 'findMany') {
        params.args = params.args || {}
        params.args.where = {
          ...(params.args.where ?? {}),
          organizationId,
        }
      }

      // count / aggregate / groupBy：注入 where 条件
      if (action === 'count' || action === 'aggregate' || action === 'groupBy') {
        params.args = params.args || {}
        params.args.where = {
          ...(params.args.where ?? {}),
          organizationId,
        }
      }

      // 更新操作：注入 where 条件
      if (action === 'update' || action === 'updateMany') {
        params.args = params.args || {}
        params.args.where = {
          ...(params.args.where ?? {}),
          organizationId,
        }
      }

      // 删除操作：注入 where 条件
      if (action === 'delete' || action === 'deleteMany') {
        params.args = params.args || {}
        params.args.where = {
          ...(params.args.where ?? {}),
          organizationId,
        }
      }

      // upsert：注入 where + create data
      if (action === 'upsert') {
        params.args = params.args || {}
        params.args.where = {
          ...(params.args.where ?? {}),
          organizationId,
        }
        if (params.args.create) {
          params.args.create = {
            ...params.args.create,
            organizationId,
          }
        }
      }

      // 创建操作：注入 data
      if (action === 'create') {
        params.args = params.args || {}
        params.args.data = {
          ...(params.args.data ?? {}),
          organizationId,
        }
      }

      // 批量创建：注入 data
      if (action === 'createMany') {
        params.args = params.args || {}
        if (Array.isArray(params.args.data)) {
          params.args.data = params.args.data.map((item: any) => ({
            ...item,
            organizationId,
          }))
        } else if (params.args.data) {
          params.args.data = { ...params.args.data, organizationId }
        }
      }

      return next(params)
    }
  }
}
