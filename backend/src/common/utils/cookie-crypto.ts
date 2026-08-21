import * as crypto from 'crypto'

export function encryptCookie(text: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(16)
  const key = crypto.scryptSync(encryptionKey, 'salt', 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decryptCookie(text: string, encryptionKey: string): string {
  const parts = text.split(':')

  if (parts.length === 2) {
    const [ivHex, encrypted] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const key = crypto.scryptSync(encryptionKey, 'salt', 32)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }

  const [ivHex, authTagHex, encrypted] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const key = crypto.scryptSync(encryptionKey, 'salt', 32)

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    // Legacy CookieManager records used the first 32 bytes directly as the AES key.
    const legacyKey = Buffer.from(encryptionKey.slice(0, 32))
    const decipher = crypto.createDecipheriv('aes-256-gcm', legacyKey, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  }
}
