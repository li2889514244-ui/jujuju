import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { StoredCookie } from './base-uploader'
import { decryptCookie, encryptCookie } from '../../common/utils/cookie-crypto'

@Injectable()
export class CookieManager {
  private readonly logger = new Logger(CookieManager.name)
  private readonly encryptionKey: string

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const key = this.config.get<string>('COOKIE_ENCRYPTION_KEY') || ''
    if (key.length >= 32) {
      this.encryptionKey = key
    } else {
      this.logger.warn(
        'COOKIE_ENCRYPTION_KEY is missing or too short; using development fallback key.',
      )
      this.encryptionKey = 'matrixflow-dev-key-32bytes!!!!!'
    }
  }

  private encrypt(data: string): string {
    return encryptCookie(data, this.encryptionKey)
  }

  private decrypt(encryptedData: string): string {
    return decryptCookie(encryptedData, this.encryptionKey)
  }

  async saveCookies(accountId: string, cookies: StoredCookie[]): Promise<void> {
    const encrypted = this.encrypt(JSON.stringify(cookies))
    await this.prisma.account.update({
      where: { id: accountId },
      data: { cookies: encrypted, cookieSavedAt: new Date() },
    })
    this.logger.log(`Cookie saved: accountId=${accountId}, count=${cookies.length}`)
  }

  async loadCookies(accountId: string): Promise<StoredCookie[] | null> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { cookies: true },
    })

    if (!account?.cookies) return null

    try {
      const decrypted = this.decrypt(account.cookies)
      return JSON.parse(decrypted) as StoredCookie[]
    } catch (error) {
      this.logger.error(`Cookie decrypt failed: accountId=${accountId}`, error)
      return null
    }
  }

  decryptCookie(encrypted: string): StoredCookie[] {
    try {
      return JSON.parse(this.decrypt(encrypted)) as StoredCookie[]
    } catch {
      return []
    }
  }

  async clearCookies(accountId: string): Promise<void> {
    await this.prisma.account.update({
      where: { id: accountId },
      data: { cookies: null },
    })
    this.logger.log(`Cookie cleared: accountId=${accountId}`)
  }
}
