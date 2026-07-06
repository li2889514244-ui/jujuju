import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { NotificationType } from '../../common/prisma-enums'

/**
 * 退款实时告警
 *
 * 每分钟检查两个平台的售后表中是否有新同步的退款记录，
 * 发现后立刻推飞书通知。
 *
 * 去重策略：查询是否已有包含相同 afterSaleId 的未读通知，
 * 避免同一笔退款重复推送。
 */
@Injectable()
export class RefundAlertScheduler implements OnModuleInit {
  private readonly logger = new Logger(RefundAlertScheduler.name)
  private lastCheckAt: Date | null = null

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
    // 启动时设定初始检查点为 1 分钟前，避免启动时推送大量历史退款
    this.lastCheckAt = new Date(Date.now() - 60_000)
    this.logger.log('RefundAlertScheduler initialized')
  }

  @Cron('*/1 * * * *')
  async checkNewRefunds() {
    if (!this.lastCheckAt) {
      this.lastCheckAt = new Date(Date.now() - 60_000)
      return
    }

    const checkFrom = this.lastCheckAt
    const checkTo = new Date()
    this.lastCheckAt = checkTo

    try {
      const [wechatNew, doudianNew] = await Promise.all([
        this.findNewWechatRefunds(checkFrom),
        this.findNewDoudianRefunds(checkFrom),
      ])

      const total = wechatNew.length + doudianNew.length
      if (total === 0) return

      this.logger.log(
        `检测到 ${total} 笔新退款（微信 ${wechatNew.length}，抖店 ${doudianNew.length}）`,
      )

      const userIds = await this.getAdminUserIds()
      if (userIds.length === 0) {
        this.logger.warn('无可用用户接收退款通知')
        return
      }

      for (const refund of [...wechatNew, ...doudianNew]) {
        for (const userId of userIds) {
          // 去重：检查是否已推送过这笔退款
          const alreadyNotified = await this.prisma.notification.findFirst({
            where: {
              userId,
              type: NotificationType.REPORT,
              read: false,
              metadata: { contains: refund.afterSaleId },
            },
            select: { id: true },
          })

          if (alreadyNotified) continue

          await this.notificationsService.create({
            userId,
            type: NotificationType.REPORT,
            title: `退款提醒: ${refund.storeName}`,
            content: this.buildRefundContent(refund),
            metadata: {
              alertType: 'refund',
              afterSaleId: refund.afterSaleId,
              storeName: refund.storeName,
              platform: refund.platform,
              orderId: refund.orderId,
              amount: refund.amount,
              reason: refund.reason,
              product: refund.product,
            },
          })
        }
      }
    } catch (error: any) {
      this.logger.error(`退款检查失败: ${error.message}`, error.stack)
    }
  }

  // ── 微信小店退款 ──────────────────────────────────────

  private async findNewWechatRefunds(since: Date) {
    const rows = await this.prisma.wechatStoreAftersale.findMany({
      where: {
        syncedAt: { gte: since },
        // type 为空或包含 refund/退货退款 都算退款
      },
      select: {
        afterSaleOrderId: true,
        storeId: true,
        type: true,
        status: true,
        amount: true,
        reason: true,
        product: true,
        createTime: true,
        syncedAt: true,
      },
      take: 50,
      orderBy: { syncedAt: 'desc' },
    })

    if (rows.length === 0) return []

    // 获取店铺名
    const stores = await this.prisma.wechatStore.findMany({
      where: { id: { in: rows.map((r) => r.storeId) } },
      select: { id: true, name: true },
    })
    const storeMap = new Map(stores.map((s) => [s.id, s.name]))

    return rows.map((r) => ({
      afterSaleId: r.afterSaleOrderId,
      platform: '微信小店' as const,
      storeName: storeMap.get(r.storeId) || '未知店铺',
      orderId: '',
      amount: r.amount,
      reason: r.reason || '',
      product: r.product || '',
      type: r.type,
      status: r.status,
      createTime: r.createTime,
    }))
  }

  // ── 抖店退款 ──────────────────────────────────────────

  private async findNewDoudianRefunds(since: Date) {
    const rows = await (this.prisma as any).doudianStoreAftersale.findMany({
      where: { syncedAt: { gte: since } },
      select: {
        afterSaleId: true,
        storeId: true,
        orderId: true,
        type: true,
        status: true,
        amount: true,
        product: true,
        createTime: true,
        updatedAt: true,
        syncedAt: true,
        raw: true,
      },
      take: 50,
      orderBy: { syncedAt: 'desc' },
    })

    if (rows.length === 0) return []

    const stores = await (this.prisma as any).doudianStore.findMany({
      where: { id: { in: rows.map((r: any) => r.storeId) } },
      select: { id: true, name: true },
    })
    const storeMap = new Map(stores.map((s: any) => [s.id, s.name]))

    return rows.map((r: any) => ({
      afterSaleId: r.afterSaleId,
      platform: '抖店' as const,
      storeName: storeMap.get(r.storeId) || '未知店铺',
      orderId: r.orderId || '',
      amount: r.amount,
      reason: r.raw?.after_sale_info?.reason_text || '',
      product: r.product || '',
      type: r.type,
      status: r.status,
      createTime: r.createTime,
    }))
  }

  // ── 构建通知内容 ──────────────────────────────────────

  private buildRefundContent(refund: {
    platform: string
    storeName: string
    orderId: string
    amount: number
    reason: string
    product: string
    type: string | number
    status: string | number
  }): string {
    const lines: string[] = []
    lines.push(`🔴 ${refund.platform} - ${refund.storeName}`)
    lines.push('')
    lines.push(`退款金额: ¥${(refund.amount / 100).toFixed(2)}`)
    if (refund.product) lines.push(`商品: ${refund.product}`)
    if (refund.orderId) lines.push(`订单号: ${refund.orderId}`)
    if (refund.reason) lines.push(`原因: ${refund.reason}`)
    lines.push(
      `时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`,
    )
    return lines.join('\n')
  }

  // ── 获取管理员用户 ────────────────────────────────────

  private async getAdminUserIds(): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    })

    if (admins.length > 0) {
      return admins.map((a) => a.id)
    }

    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
      take: 10,
    })
    return users.map((u) => u.id)
  }
}
