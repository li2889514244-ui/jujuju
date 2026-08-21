import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { NotificationType } from '../../common/prisma-enums'
import { PrismaService } from '../../prisma/prisma.service'
import { isDoudianSuccessfulRefund } from '../doudian-browser/doudian-store-metrics'
import { NotificationsService } from '../notifications/notifications.service'

interface RefundAlertItem {
  afterSaleId: string
  organizationId: string | null
  platform: string
  storeName: string
  orderId: string
  amount: number
  reason: string
  product: string
  type: string | number
  status: string | number
  createTime: number
}

const WECHAT_SUCCESSFUL_REFUND_STATUS = 'MERCHANT_REFUND_SUCCESS'
const ADMIN_ROLES = ['ADMIN', 'OWNER', 'SUPER_ADMIN'] as const

const SILENT_REFUND_KEYWORDS = [
  '多拍/错拍/不想要',
  '不喜欢/效果不好',
  '7天无理由',
  '无理由退款',
  '不想要了',
  '尺码不合适',
  '大小尺寸不合适',
  '大小颜色',
  '型号不合适',
  '颜色/型号',
  '尺寸不合适',
  '拍错',
  '多拍',
  '与商家协商一致退款',
  '个人行程与课程安排冲突',
  '难度不适合',
]

function isSilentRefundReason(reason: string): boolean {
  if (!reason) return false
  const normalized = reason.trim()
  return SILENT_REFUND_KEYWORDS.some((kw) => normalized.includes(kw))
}

@Injectable()
export class RefundAlertScheduler implements OnModuleInit {
  private readonly logger = new Logger(RefundAlertScheduler.name)
  private lastCheckAt: Date | null = null

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  onModuleInit() {
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

      const wechatFiltered = wechatNew.filter((r) => !isSilentRefundReason(r.reason))
      const doudianFiltered = doudianNew.filter((r) => !isSilentRefundReason(r.reason))
      const silentCount =
        wechatNew.length + doudianNew.length - wechatFiltered.length - doudianFiltered.length

      const refunds = [...wechatFiltered, ...doudianFiltered]
      if (refunds.length === 0) {
        if (silentCount > 0) {
          this.logger.log(`检测到 ${silentCount} 笔退款已静默过滤`)
        }
        return
      }

      this.logger.log(
        `检测到 ${refunds.length} 笔新成功退款需推送` +
          (silentCount > 0 ? `，已过滤 ${silentCount} 笔主观原因退款` : ''),
      )

      for (const refund of refunds) {
        const userIds = await this.getAdminUserIds(refund.organizationId)
        if (userIds.length === 0) {
          this.logger.warn(
            `组织 ${refund.organizationId || 'default'} 没有可接收退款提醒的用户`,
          )
          continue
        }

        let pushedFeishuForRefund = false
        for (const userId of userIds) {
          const alreadyNotified = await this.prisma.notification.findFirst({
            where: {
              userId,
              type: NotificationType.REFUND_ALERT,
              organizationId: refund.organizationId,
              read: false,
              metadata: { contains: `"afterSaleId":"${refund.afterSaleId}"` },
            },
            select: { id: true },
          })

          if (alreadyNotified) continue

          await this.notificationsService.create({
            userId,
            organizationId: refund.organizationId,
            type: NotificationType.REFUND_ALERT,
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
            pushFeishu: !pushedFeishuForRefund,
          })
          pushedFeishuForRefund = true
        }
      }
    } catch (error: any) {
      this.logger.error(`退款检查失败: ${error.message}`, error.stack)
    }
  }

  private async findNewWechatRefunds(since: Date): Promise<RefundAlertItem[]> {
    const rows = await this.prisma.wechatStoreAftersale.findMany({
      where: {
        syncedAt: { gte: since },
        status: WECHAT_SUCCESSFUL_REFUND_STATUS,
        amount: { gt: 0 },
      },
      select: {
        afterSaleOrderId: true,
        storeId: true,
        type: true,
        status: true,
        amount: true,
        reason: true,
        product: true,
        completeTime: true,
        createTime: true,
      },
      take: 50,
      orderBy: { syncedAt: 'desc' },
    })

    const sinceSec = Math.floor(since.getTime() / 1000)
    const freshRows = rows.filter((r) => this.getWechatRefundEventTime(r) >= sinceSec)
    if (freshRows.length === 0) return []

    const stores = await this.prisma.wechatStore.findMany({
      where: { id: { in: freshRows.map((r) => r.storeId) } },
      select: { id: true, name: true, organizationId: true },
    })
    const storeMap = new Map(stores.map((s) => [s.id, s]))

    return freshRows.map((r) => {
      const store = storeMap.get(r.storeId)
      return {
        afterSaleId: r.afterSaleOrderId,
        organizationId: store?.organizationId || null,
        platform: '微信小店',
        storeName: store?.name || '未知店铺',
        orderId: '',
        amount: r.amount,
        reason: r.reason || '',
        product: r.product || '',
        type: r.type,
        status: r.status,
        createTime: this.getWechatRefundEventTime(r),
      }
    })
  }

  private async findNewDoudianRefunds(since: Date): Promise<RefundAlertItem[]> {
    const rows = await (this.prisma as any).doudianStoreAftersale.findMany({
      where: {
        syncedAt: { gte: since },
        amount: { gt: 0 },
      },
      select: {
        afterSaleId: true,
        storeId: true,
        orderId: true,
        type: true,
        status: true,
        amount: true,
        product: true,
        createTime: true,
        updateTime: true,
        raw: true,
      },
      take: 50,
      orderBy: { syncedAt: 'desc' },
    })

    const successfulRows = rows.filter((r: any) =>
      isDoudianSuccessfulRefund({
        status: r.status,
        status_text: r.raw?.after_sale_info?.status_text || r.raw?.status_text,
      }),
    )
    const sinceSec = Math.floor(since.getTime() / 1000)
    const freshRows = successfulRows.filter(
      (r: any) => this.getDoudianRefundEventTime(r) >= sinceSec,
    )
    if (freshRows.length === 0) return []

    const stores = await (this.prisma as any).doudianStore.findMany({
      where: { id: { in: freshRows.map((r: any) => r.storeId) } },
      select: { id: true, name: true, organizationId: true },
    })
    const storeMap = new Map<
      string,
      { id: string; name: string; organizationId: string | null }
    >(stores.map((s: any) => [s.id, s]))

    return freshRows.map((r: any) => {
      const store = storeMap.get(r.storeId)
      return {
        afterSaleId: r.afterSaleId,
        organizationId: store?.organizationId || null,
        platform: '抖店',
        storeName: store?.name || '未知店铺',
        orderId: r.orderId || '',
        amount: r.amount,
        reason: r.raw?.after_sale_info?.reason_text || r.raw?.reason_text || '',
        product: r.product || '',
        type: r.type,
        status: r.status,
        createTime: this.getDoudianRefundEventTime(r),
      }
    })
  }

  private getWechatRefundEventTime(row: { completeTime?: number; createTime?: number }) {
    return Number(row.completeTime || row.createTime || 0)
  }

  private getDoudianRefundEventTime(row: { updateTime?: number; createTime?: number }) {
    return Number(row.updateTime || row.createTime || 0)
  }

  private buildRefundContent(refund: RefundAlertItem): string {
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

  private async getAdminUserIds(organizationId: string | null): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: [...ADMIN_ROLES] as any }, status: 'ACTIVE', organizationId },
      select: { id: true },
    })

    if (admins.length > 0) {
      return admins.map((a) => a.id)
    }

    const users = await this.prisma.user.findMany({
      where: { status: 'ACTIVE', organizationId },
      select: { id: true },
      take: 10,
    })
    return users.map((u) => u.id)
  }
}
