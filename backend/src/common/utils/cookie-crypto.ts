import * as crypto from 'crypto';

/**
 * 加密 Cookie（AES-256-GCM）
 * 独立工具函数，供多个 service 复用
 */
export function encryptCookie(text: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

/**
 * 解密 Cookie（兼容 GCM 和旧 CBC 格式）
 */
export function decryptCookie(text: string, encryptionKey: string): string {
  const parts = text.split(':');
  if (parts.length === 2) {
    // 旧 CBC 格式
    const [ivHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
  // GCM 格式: iv:authTag:encrypted
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(encryptionKey, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
