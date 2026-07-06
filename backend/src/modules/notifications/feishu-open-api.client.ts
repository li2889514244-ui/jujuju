import { Injectable, Logger } from '@nestjs/common'
import axios, { AxiosInstance } from 'axios'

// ── Types ──────────────────────────────────────────────

export type FeishuReceiveIdType = 'open_id' | 'user_id' | 'union_id' | 'email' | 'chat_id'

export type FeishuMsgType = 'text' | 'interactive' | 'post'

export interface FeishuAppConfig {
  appId: string
  appSecret: string
}

export interface FeishuAppSettings {
  mode: 'webhook' | 'app'
  appId: string
  appSecretConfigured: boolean
  receiveIdType: FeishuReceiveIdType
  receiveId: string
  enabled: boolean
  notifyTypes: string[]
  envFileWritable: boolean
}

export interface FeishuSendResult {
  sent: boolean
  message: string
  messageId?: string
}

interface TokenCache {
  token: string
  expiresAt: number // epoch ms
}

interface SendMessageResponse {
  code: number
  msg: string
  data?: {
    message_id?: string
  }
}

interface TokenResponse {
  code: number
  msg: string
  tenant_access_token: string
  expire: number
}

// ── Card templates by notification type ────────────────

const CARD_TEMPLATES: Record<string, string> = {
  SYSTEM: 'blue',
  ACCOUNT: 'orange',
  CONTENT: 'purple',
  REPORT: 'cyan',
  PUBLISH_SUCCESS: 'green',
  PUBLISH_FAILED: 'red',
  CREDENTIAL_EXPIRED: 'orange',
}

const CARD_TITLES: Record<string, string> = {
  SYSTEM: '系统通知',
  ACCOUNT: '账号通知',
  CONTENT: '内容通知',
  REPORT: '报告通知',
  PUBLISH_SUCCESS: '发布成功',
  PUBLISH_FAILED: '发布失败',
  CREDENTIAL_EXPIRED: '凭据过期',
}

// ── Client ─────────────────────────────────────────────

@Injectable()
export class FeishuOpenApiClient {
  private readonly logger = new Logger(FeishuOpenApiClient.name)
  private readonly http: AxiosInstance
  private tokenCache: TokenCache | null = null
  private tokenRefreshPromise: Promise<string> | null = null

  constructor() {
    this.http = axios.create({
      baseURL: 'https://open.feishu.cn/open-apis',
      timeout: 10000,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  }

  // ── Config helpers ──────────────────────────────────

  getAppId(): string {
    return (process.env.FEISHU_APP_ID || '').trim()
  }

  getAppSecret(): string {
    return (process.env.FEISHU_APP_SECRET || '').trim()
  }

  isAppConfigured(): boolean {
    return Boolean(this.getAppId() && this.getAppSecret())
  }

  getReceiveIdType(): FeishuReceiveIdType {
    const raw = (process.env.FEISHU_RECEIVE_ID_TYPE || 'open_id').trim()
    const valid: FeishuReceiveIdType[] = ['open_id', 'user_id', 'union_id', 'email', 'chat_id']
    return valid.includes(raw as FeishuReceiveIdType) ? (raw as FeishuReceiveIdType) : 'open_id'
  }

  getReceiveId(): string {
    return (process.env.FEISHU_RECEIVE_ID || '').trim()
  }

  getMode(): 'webhook' | 'app' {
    const raw = (process.env.FEISHU_NOTIFY_MODE || 'webhook').trim().toLowerCase()
    return raw === 'app' ? 'app' : 'webhook'
  }

  // ── Token management ────────────────────────────────

  /**
   * 清除缓存的 token（凭证变更时调用）
   */
  invalidateToken() {
    this.tokenCache = null
  }

  /**
   * 获取 tenant_access_token，自动缓存，提前 5 分钟刷新
   */
  async getTenantAccessToken(): Promise<string> {
    // 如果缓存的 token 还有 5 分钟以上有效期，直接返回
    if (this.tokenCache && this.tokenCache.expiresAt - Date.now() > 5 * 60 * 1000) {
      return this.tokenCache.token
    }

    // 防止并发刷新
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise
    }

    this.tokenRefreshPromise = this.refreshToken()
    try {
      return await this.tokenRefreshPromise
    } finally {
      this.tokenRefreshPromise = null
    }
  }

  private async refreshToken(): Promise<string> {
    const appId = this.getAppId()
    const appSecret = this.getAppSecret()

    if (!appId || !appSecret) {
      throw new Error('FEISHU_APP_ID or FEISHU_APP_SECRET is not configured.')
    }

    const response = await this.http.post<TokenResponse>('/auth/v3/tenant_access_token/internal', {
      app_id: appId,
      app_secret: appSecret,
    })

    const data = response.data
    if (data.code !== 0) {
      throw new Error(`Failed to get tenant_access_token: ${data.msg} (code: ${data.code})`)
    }

    this.tokenCache = {
      token: data.tenant_access_token,
      expiresAt: Date.now() + data.expire * 1000,
    }

    this.logger.log('Feishu tenant_access_token refreshed successfully')
    return data.tenant_access_token
  }

  // ── Send message ────────────────────────────────────

  /**
   * 发送文本消息
   */
  async sendText(
    receiveId: string,
    receiveIdType: FeishuReceiveIdType,
    text: string,
  ): Promise<FeishuSendResult> {
    return this.sendMessage(receiveId, receiveIdType, 'text', { text })
  }

  /**
   * 发送交互式消息卡片
   */
  async sendCard(
    receiveId: string,
    receiveIdType: FeishuReceiveIdType,
    card: Record<string, any>,
  ): Promise<FeishuSendResult> {
    return this.sendMessage(receiveId, receiveIdType, 'interactive', card)
  }

  /**
   * 发送消息（底层方法）
   */
  async sendMessage(
    receiveId: string,
    receiveIdType: FeishuReceiveIdType,
    msgType: FeishuMsgType,
    content: Record<string, any>,
  ): Promise<FeishuSendResult> {
    if (!this.isAppConfigured()) {
      return { sent: false, message: 'Feishu app credentials are not configured.' }
    }

    if (!receiveId) {
      return { sent: false, message: 'FEISHU_RECEIVE_ID is not configured.' }
    }

    try {
      const token = await this.getTenantAccessToken()

      const response = await this.http.post<SendMessageResponse>(
        '/im/v1/messages',
        {
          receive_id: receiveId,
          msg_type: msgType,
          content: JSON.stringify(content),
        },
        {
          params: { receive_id_type: receiveIdType },
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: (status) => status >= 200 && status < 500,
        },
      )

      const data = response.data

      if (data.code !== 0) {
        this.logger.warn(`Feishu API rejected message: ${data.msg} (code: ${data.code})`)
        return { sent: false, message: `${data.msg} (code: ${data.code})` }
      }

      return {
        sent: true,
        message: 'sent',
        messageId: data.data?.message_id,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Feishu send message failed: ${message}`)
      return { sent: false, message }
    }
  }

  // ── Card builder ────────────────────────────────────

  /**
   * 构建飞书交互式消息卡片
   */
  buildCard(params: {
    type: string
    title: string
    content?: string
    metadata?: Record<string, any>
    userId?: string
  }): Record<string, any> {
    const template = CARD_TEMPLATES[params.type] || 'blue'
    const headerTitle = CARD_TITLES[params.type] || '通知'

    const elements: Record<string, any>[] = []

    // 标题
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**${this.escapeMd(params.title)}**`,
      },
    })

    // 正文
    if (params.content) {
      elements.push({
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: this.escapeMd(params.content),
        },
      })
    }

    // 分割线
    elements.push({ tag: 'hr' })

    // 元数据
    const noteElements: Record<string, any>[] = [
      {
        tag: 'plain_text',
        content: `类型: ${params.type}`,
      },
    ]

    if (params.userId) {
      noteElements.push({
        tag: 'plain_text',
        content: `用户: ${params.userId}`,
      })
    }

    noteElements.push({
      tag: 'plain_text',
      content: `时间: ${this.formatBeijingTime(new Date())}`,
    })

    elements.push({
      tag: 'note',
      elements: noteElements,
    })

    // 元数据详情（如果有）
    if (params.metadata) {
      const metaStr = this.truncate(JSON.stringify(params.metadata), 500)
      elements.push({
        tag: 'note',
        elements: [
          {
            tag: 'plain_text',
            content: `附加信息: ${metaStr}`,
          },
        ],
      })
    }

    return {
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: `[MatrixFlow] ${headerTitle}`,
        },
        template,
      },
      elements,
    }
  }

  // ── Test message ────────────────────────────────────

  buildTestCard(): Record<string, any> {
    return {
      config: { wide_screen_mode: true },
      header: {
        title: {
          tag: 'plain_text',
          content: '[MatrixFlow] 测试通知',
        },
        template: 'blue',
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content:
              '**飞书应用机器人连接测试**\n\nMatrixFlow 飞书应用机器人通知已成功连接，后续通知将通过此机器人推送。',
          },
        },
        { tag: 'hr' },
        {
          tag: 'note',
          elements: [
            {
              tag: 'plain_text',
              content: `发送时间: ${this.formatBeijingTime(new Date())}`,
            },
          ],
        },
      ],
    }
  }

  // ── Utility ─────────────────────────────────────────

  private formatBeijingTime(date: Date): string {
    return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength - 3)}...`
  }

  private escapeMd(text: string): string {
    // 转义 lark_md 中的特殊字符（避免卡片渲染问题）
    return text.replace(/[*_`~]/g, (match) => `\\${match}`)
  }
}
