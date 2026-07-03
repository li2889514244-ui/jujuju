import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import axios from 'axios'
import { createHmac } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
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

export interface FeishuSettings {
  enabled: boolean
  configured: boolean
  webhookUrl: string
  webhookSecretConfigured: boolean
  notifyTypes: NotificationType[]
  envFileWritable: boolean
}

interface UpdateFeishuSettingsParams {
  webhookUrl?: string
  webhookSecret?: string
  notifyTypes?: string[]
  enabled?: boolean
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

  getFeishuSettings(): FeishuSettings {
    return {
      enabled: this.isFeishuEnabled(),
      configured: Boolean(this.getFeishuWebhookUrl()),
      webhookUrl: this.maskWebhookUrl(this.getFeishuWebhookUrl()),
      webhookSecretConfigured: Boolean(this.getFeishuWebhookSecret()),
      notifyTypes: this.getAllowedFeishuTypes(),
      envFileWritable: this.isEnvFileWritable(),
    }
  }

  updateFeishuSettings(params: UpdateFeishuSettingsParams): FeishuSettings {
    const webhookUrl = typeof params.webhookUrl === 'string' ? params.webhookUrl.trim() : undefined
    const webhookSecret =
      typeof params.webhookSecret === 'string' ? params.webhookSecret.trim() : undefined
    const enabled = params.enabled !== false
    const notifyTypes = this.normalizeNotifyTypes(params.notifyTypes)

    if (webhookUrl !== undefined && webhookUrl && !this.isValidFeishuWebhookUrl(webhookUrl)) {
      throw new BadRequestException('Invalid Feishu webhook URL.')
    }

    const updates: Record<string, string> = {
      FEISHU_NOTIFY_ENABLED: enabled ? 'true' : 'false',
      FEISHU_NOTIFY_TYPES: notifyTypes.join(','),
    }

    if (webhookUrl !== undefined) {
      updates.FEISHU_WEBHOOK_URL = webhookUrl
    }

    if (webhookSecret !== undefined) {
      updates.FEISHU_WEBHOOK_SECRET = webhookSecret
    }

    Object.entries(updates).forEach(([key, value]) => {
      process.env[key] = value
    })

    this.persistEnvUpdates(updates)
    return this.getFeishuSettings()
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
    const allowed = this.getAllowedFeishuTypes()

    return allowed.length === 0 || allowed.includes(type)
  }

  private getAllowedFeishuTypes(): NotificationType[] {
    return this.normalizeNotifyTypes(
      (process.env.FEISHU_NOTIFY_TYPES || process.env.LARK_NOTIFY_TYPES || '')
        .split(',')
        .map((item) => item.trim()),
    )
  }

  private normalizeNotifyTypes(types?: string[]): NotificationType[] {
    const valid = new Set(Object.values(NotificationType))
    return Array.from(
      new Set((types || []).map((item) => item.trim()).filter((item) => valid.has(item as any))),
    ) as NotificationType[]
  }

  private isValidFeishuWebhookUrl(value: string): boolean {
    try {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        (url.hostname === 'open.feishu.cn' || url.hostname === 'open.larksuite.com') &&
        url.pathname.includes('/open-apis/bot/')
      )
    } catch {
      return false
    }
  }

  private maskWebhookUrl(value: string): string {
    if (!value) return ''
    const visible = 12
    if (value.length <= visible * 2) return value
    return `${value.slice(0, visible)}...${value.slice(-visible)}`
  }

  private isEnvFileWritable(): boolean {
    try {
      const envPath = this.getEnvFilePath()
      return existsSync(envPath) || existsSync(process.cwd())
    } catch {
      return false
    }
  }

  private persistEnvUpdates(updates: Record<string, string>) {
    const envPath = this.getEnvFilePath()
    try {
      const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : []
      const seen = new Set<string>()
      const next = lines.map((line) => {
        if (!line || line.trimStart().startsWith('#') || !line.includes('=')) return line
        const key = line.split('=', 1)[0].trim()
        if (!(key in updates)) return line
        seen.add(key)
        return `${key}=${updates[key]}`
      })

      Object.entries(updates).forEach(([key, value]) => {
        if (!seen.has(key)) next.push(`${key}=${value}`)
      })

      writeFileSync(envPath, `${next.join('\n').replace(/\n+$/, '')}\n`, 'utf8')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Failed to persist Feishu settings to .env: ${message}`)
    }
  }

  private getEnvFilePath(): string {
    // 1. 尝试 process.cwd()/.env（最常见）
    const cwdPath = join(process.cwd(), '.env')
    if (existsSync(cwdPath)) return cwdPath

    // 2. 尝试 __dirname/../.env（编译后 dist/ 目录的场景）
    const distPath = join(__dirname, '..', '..', '..', '.env')
    if (existsSync(distPath)) return distPath

    // 3. 尝试 DOTENV_CONFIG_PATH 环境变量
    const envConfigPath = process.env.DOTENV_CONFIG_PATH
    if (envConfigPath && existsSync(envConfigPath)) return envConfigPath

    // 4. 回退到 process.cwd()/.env（即使不存在，也允许创建）
    return cwdPath
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
