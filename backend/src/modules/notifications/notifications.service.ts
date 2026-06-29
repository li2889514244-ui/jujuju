import { Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import { createHmac } from 'crypto'
import { NotificationType } from '../../common/prisma-enums'
import { PrismaService } from '../../prisma/prisma.service'

interface NotificationCreateParams {
  userId: string
  type: NotificationType
  title: string
  content?: string
  metadata?: Record<string, any>
}

export interface FeishuPushResult {
  enabled: boolean
  sent: boolean
  message: string
  status?: number
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name)

  constructor(private prisma: PrismaService) {}

  async create(params: NotificationCreateParams) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        content: params.content || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
      },
    })

    this.logger.log(`Notification created [${params.type}] ${params.title} -> ${params.userId}`)
    void this.pushFeishuNotification(params).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Feishu notification push failed: ${message}`)
    })

    return notification
  }

  async sendFeishuTest(userId: string): Promise<FeishuPushResult> {
    return this.pushFeishuNotification(
      {
        userId,
        type: NotificationType.SYSTEM,
        title: 'Feishu notification test',
        content: 'MatrixFlow Feishu notifications are connected.',
        metadata: { source: 'manual-test' },
      },
      true,
    )
  }

  async findAll(userId: string, params: { skip?: number; take?: number; unreadOnly?: boolean }) {
    const { skip = 0, take = 20, unreadOnly = false } = params

    const where: any = { userId }
    if (unreadOnly) where.read = false

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ])

    return { notifications, total, unreadCount, skip, take }
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, read: false },
    })
    return { unreadCount: count }
  }

  async markAsRead(id: string, userId: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    })
    return { success: true }
  }

  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    })
    return { success: true, count: result.count }
  }

  async remove(id: string, userId: string) {
    await this.prisma.notification.deleteMany({
      where: { id, userId },
    })
    return { success: true }
  }

  async clearRead(userId: string) {
    const result = await this.prisma.notification.deleteMany({
      where: { userId, read: true },
    })
    return { success: true, count: result.count }
  }

  private async pushFeishuNotification(
    params: NotificationCreateParams,
    force = false,
  ): Promise<FeishuPushResult> {
    const webhookUrl = this.getFeishuWebhookUrl()
    if (!webhookUrl) {
      return {
        enabled: false,
        sent: false,
        message: 'FEISHU_WEBHOOK_URL is not configured.',
      }
    }

    if (!this.isFeishuEnabled()) {
      return { enabled: false, sent: false, message: 'Feishu notifications are disabled.' }
    }

    if (!force && !this.isAllowedFeishuType(params.type)) {
      return {
        enabled: true,
        sent: false,
        message: `Notification type ${params.type} is filtered by FEISHU_NOTIFY_TYPES.`,
      }
    }

    const payload: Record<string, any> = {
      msg_type: 'text',
      content: {
        text: this.buildFeishuText(params),
      },
    }

    const secret = this.getFeishuWebhookSecret()
    if (secret) {
      Object.assign(payload, this.createFeishuSignature(secret))
    }

    const response = await axios.post(webhookUrl, payload, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (status) => status >= 200 && status < 500,
    })

    const responseData = response.data as {
      code?: number
      msg?: string
      StatusCode?: number
      StatusMessage?: string
    }
    const feishuCode = responseData?.code ?? responseData?.StatusCode
    if (response.status >= 400 || (typeof feishuCode === 'number' && feishuCode !== 0)) {
      const reason = responseData?.msg || responseData?.StatusMessage || `HTTP ${response.status}`
      this.logger.warn(`Feishu notification was rejected: ${reason}`)
      return { enabled: true, sent: false, status: response.status, message: reason }
    }

    return { enabled: true, sent: true, status: response.status, message: 'sent' }
  }

  private getFeishuWebhookUrl(): string {
    return (process.env.FEISHU_WEBHOOK_URL || process.env.LARK_WEBHOOK_URL || '').trim()
  }

  private getFeishuWebhookSecret(): string {
    return (process.env.FEISHU_WEBHOOK_SECRET || process.env.LARK_WEBHOOK_SECRET || '').trim()
  }

  private isFeishuEnabled(): boolean {
    return (process.env.FEISHU_NOTIFY_ENABLED || 'true').toLowerCase() !== 'false'
  }

  private isAllowedFeishuType(type: NotificationType): boolean {
    const raw = process.env.FEISHU_NOTIFY_TYPES || process.env.LARK_NOTIFY_TYPES || ''
    const allowed = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)

    return allowed.length === 0 || allowed.includes(type)
  }

  private createFeishuSignature(secret: string) {
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const stringToSign = `${timestamp}\n${secret}`
    const sign = createHmac('sha256', stringToSign).update('').digest('base64')
    return { timestamp, sign }
  }

  private buildFeishuText(params: NotificationCreateParams): string {
    const lines = [
      `[MatrixFlow] ${params.title}`,
      `Type: ${params.type}`,
      `User: ${params.userId}`,
      `Time: ${this.formatBeijingTime(new Date())}`,
    ]

    if (params.content) {
      lines.push('', this.truncate(params.content, 1200))
    }

    if (params.metadata) {
      lines.push('', `Metadata: ${this.truncate(JSON.stringify(params.metadata), 800)}`)
    }

    return this.truncate(lines.join('\n'), 3500)
  }

  private formatBeijingTime(date: Date): string {
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength - 3)}...`
  }
}
