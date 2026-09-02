import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import * as fs from 'fs'
import * as path from 'path'

const LOADING_IMAGES_KEY = 'loading_images'
const LEGACY_LOADING_IMAGE_KEY = 'loading_image'
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const MAX_LIBRARY_IMAGES = 30
const SAFE_FILE_NAME = /^refresh-image-[A-Za-z0-9_-]+\.(png|jpg|webp)$/

/** 上传图片文件的轻量结构（避免依赖 @types/multer） */
export interface UploadedImageFile {
  buffer: Buffer
  mimetype: string
  size: number
}

export interface LoadingImageItem {
  fileName: string
  url: string
  createdAt: string
}

export interface LoadingImageConfig {
  images: LoadingImageItem[]
  randomEnabled: boolean
  defaultImageUrl: string
  hasCustom: boolean
}

interface StoredImage {
  fileName: string
  ext: string
  mime: string
  createdAt: string
}

interface StoredConfig {
  images: StoredImage[]
  randomEnabled: boolean
  defaultFileName: string | null
}

@Injectable()
export class OrganizationSettingsService {
  private readonly logger = new Logger(OrganizationSettingsService.name)

  constructor(private readonly prisma: PrismaService) {}

  private resolveUploadDir(): string {
    if (process.env.LOADING_IMAGE_DIR) return process.env.LOADING_IMAGE_DIR
    // 生产环境写入前端静态目录，由 nginx 直接提供；本地开发写入 backend/uploads。
    return process.env.NODE_ENV === 'production'
      ? '/opt/matrixflow/frontend-dist/uploads'
      : path.join(process.cwd(), 'uploads')
  }

  private async getOrganizationId(user: any): Promise<string> {
    const userRow = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { organizationId: true },
    })
    if (!userRow?.organizationId) {
      throw new ForbiddenException('当前账号没有所属组织，无法保存组织设置')
    }
    return userRow.organizationId
  }

  private async readStored(organizationId: string): Promise<{ config: StoredConfig; updatedAt: Date } | null> {
    const row = await this.prisma.organizationSetting.findUnique({
      where: { organizationId_key: { organizationId, key: LOADING_IMAGES_KEY } },
      select: { value: true, updatedAt: true },
    })
    if (!row) return null
    try {
      const parsed = JSON.parse(row.value) as StoredConfig
      return { config: parsed, updatedAt: row.updatedAt }
    } catch {
      return null
    }
  }

  /** 兼容旧的单图配置（loading_image），一次性迁移进新图片库 */
  private async migrateLegacyIfNeeded(organizationId: string): Promise<void> {
    const legacy = await this.prisma.organizationSetting.findUnique({
      where: { organizationId_key: { organizationId, key: LEGACY_LOADING_IMAGE_KEY } },
      select: { value: true, createdAt: true },
    })
    if (!legacy) return
    try {
      const legacyParsed = JSON.parse(legacy.value) as { fileName?: string; ext?: string; mime?: string }
      if (legacyParsed.fileName) {
        const current = await this.readStored(organizationId)
        const images = current ? current.config.images : []
        if (!images.some((item) => item.fileName === legacyParsed.fileName)) {
          images.push({
            fileName: legacyParsed.fileName,
            ext: legacyParsed.ext || 'png',
            mime: legacyParsed.mime || 'image/png',
            createdAt: legacy.createdAt.toISOString(),
          })
        }
        await this.prisma.organizationSetting.upsert({
          where: { organizationId_key: { organizationId, key: LOADING_IMAGES_KEY } },
          update: { value: JSON.stringify({ images, randomEnabled: true, defaultFileName: null }) },
          create: {
            organizationId,
            key: LOADING_IMAGES_KEY,
            value: JSON.stringify({ images, randomEnabled: true, defaultFileName: null }),
          },
        })
      }
    } catch {
      /* 旧配置损坏时忽略 */
    }
    await this.prisma.organizationSetting.deleteMany({
      where: { organizationId, key: LEGACY_LOADING_IMAGE_KEY },
    })
  }

  private toDto(stored: { config: StoredConfig; updatedAt: Date }): LoadingImageConfig {
    const stamp = Math.floor(stored.updatedAt.getTime() / 1000)
    const images = stored.config.images.map((item) => ({
      fileName: item.fileName,
      url: '/uploads/' + item.fileName + '?v=' + stamp,
      createdAt: item.createdAt,
    }))
    let defaultImageUrl = ''
    if (stored.config.defaultFileName) {
      const found = images.find((item) => item.fileName === stored.config.defaultFileName)
      defaultImageUrl = found ? found.url : images[0]?.url || ''
    }
    return {
      images,
      randomEnabled: stored.config.randomEnabled !== false,
      defaultImageUrl,
      hasCustom: images.length > 0,
    }
  }

  async getLoadingImageConfig(user: any): Promise<LoadingImageConfig> {
    const organizationId = await this.getOrganizationId(user)
    await this.migrateLegacyIfNeeded(organizationId)
    const stored = await this.readStored(organizationId)
    if (!stored || stored.config.images.length === 0) {
      return { images: [], randomEnabled: true, defaultImageUrl: '', hasCustom: false }
    }
    return this.toDto(stored)
  }

  async uploadLoadingImages(user: any, files: UploadedImageFile[] | undefined): Promise<LoadingImageConfig> {
    const organizationId = await this.getOrganizationId(user)
    await this.migrateLegacyIfNeeded(organizationId)
    const list = Array.isArray(files) ? files : []
    if (list.length === 0) {
      throw new BadRequestException({ code: 'LOADING_IMAGE_EMPTY', message: '请选择要上传的图片。' })
    }
    const stored = await this.readStored(organizationId)
    const images: StoredImage[] = stored ? [...stored.config.images] : []
    const uploadDir = this.resolveUploadDir()
    fs.mkdirSync(uploadDir, { recursive: true })

    for (const file of list) {
      if (!file || !file.buffer || file.buffer.length === 0) {
        throw new BadRequestException({ code: 'LOADING_IMAGE_EMPTY', message: '存在空图片文件，请重新选择。' })
      }
      const ext = ALLOWED_IMAGE_TYPES[file.mimetype || '']
      if (!ext) {
        throw new BadRequestException({
          code: 'LOADING_IMAGE_TYPE_UNSUPPORTED',
          message: '仅支持 PNG / JPG / JPEG / WEBP 图片。',
        })
      }
      if (file.buffer.length > MAX_IMAGE_BYTES) {
        throw new BadRequestException({
          code: 'LOADING_IMAGE_TOO_LARGE',
          message: '单张图片不能超过 3MB。',
        })
      }
      if (images.length >= MAX_LIBRARY_IMAGES) {
        throw new BadRequestException({
          code: 'LOADING_LIBRARY_FULL',
          message: '图片库最多保存 30 张图片，请先删除部分图片。',
        })
      }
      const fileName = 'refresh-image-' + organizationId + '-' + Date.now() + '-' + images.length + '.' + ext
      fs.writeFileSync(path.join(uploadDir, fileName), file.buffer)
      images.push({ fileName, ext, mime: file.mimetype, createdAt: new Date().toISOString() })
    }

    const config: StoredConfig = {
      images,
      randomEnabled: stored?.config.randomEnabled !== false,
      defaultFileName: stored?.config.defaultFileName || null,
    }
    await this.prisma.organizationSetting.upsert({
      where: { organizationId_key: { organizationId, key: LOADING_IMAGES_KEY } },
      update: { value: JSON.stringify(config) },
      create: { organizationId, key: LOADING_IMAGES_KEY, value: JSON.stringify(config) },
    })
    const fresh = await this.readStored(organizationId)
    return fresh ? this.toDto(fresh) : { images: [], randomEnabled: true, defaultImageUrl: '', hasCustom: false }
  }

  async deleteLoadingImage(user: any, fileName: string): Promise<LoadingImageConfig> {
    const organizationId = await this.getOrganizationId(user)
    if (!SAFE_FILE_NAME.test(fileName)) {
      throw new BadRequestException({ code: 'LOADING_IMAGE_INVALID', message: '非法的图片文件名。' })
    }
    const stored = await this.readStored(organizationId)
    if (!stored) throw new NotFoundException({ code: 'LOADING_IMAGE_NOT_FOUND', message: '图片库不存在。' })
    const target = stored.config.images.find((item) => item.fileName === fileName)
    if (!target) throw new NotFoundException({ code: 'LOADING_IMAGE_NOT_FOUND', message: '图片不存在。' })

    const uploadDir = this.resolveUploadDir()
    const filePath = path.join(uploadDir, fileName)
    if (path.dirname(filePath) === path.resolve(uploadDir) && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    const images = stored.config.images.filter((item) => item.fileName !== fileName)
    const config: StoredConfig = {
      images,
      randomEnabled: stored.config.randomEnabled !== false,
      defaultFileName:
        stored.config.defaultFileName === fileName ? null : stored.config.defaultFileName || null,
    }
    await this.prisma.organizationSetting.upsert({
      where: { organizationId_key: { organizationId, key: LOADING_IMAGES_KEY } },
      update: { value: JSON.stringify(config) },
      create: { organizationId, key: LOADING_IMAGES_KEY, value: JSON.stringify(config) },
    })
    const fresh = await this.readStored(organizationId)
    return fresh ? this.toDto(fresh) : { images: [], randomEnabled: true, defaultImageUrl: '', hasCustom: false }
  }

  async resetLoadingImages(user: any): Promise<LoadingImageConfig> {
    const organizationId = await this.getOrganizationId(user)
    const stored = await this.readStored(organizationId)
    if (stored) {
      const uploadDir = this.resolveUploadDir()
      for (const item of stored.config.images) {
        try {
          const filePath = path.join(uploadDir, item.fileName)
          if (path.dirname(filePath) === path.resolve(uploadDir) && fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } catch {
          /* 忽略清理失败 */
        }
      }
    }
    await this.prisma.organizationSetting.deleteMany({
      where: { organizationId, key: LOADING_IMAGES_KEY },
    })
    await this.prisma.organizationSetting.deleteMany({
      where: { organizationId, key: LEGACY_LOADING_IMAGE_KEY },
    })
    return { images: [], randomEnabled: true, defaultImageUrl: '', hasCustom: false }
  }

  async updateLoadingPrefs(
    user: any,
    prefs: { randomEnabled?: boolean; defaultFileName?: string | null },
  ): Promise<LoadingImageConfig> {
    const organizationId = await this.getOrganizationId(user)
    const stored = await this.readStored(organizationId)
    if (!stored || stored.config.images.length === 0) {
      throw new NotFoundException({ code: 'LOADING_IMAGE_NOT_FOUND', message: '图片库为空，请先上传图片。' })
    }
    const config: StoredConfig = {
      images: stored.config.images,
      randomEnabled: prefs.randomEnabled !== undefined ? Boolean(prefs.randomEnabled) : stored.config.randomEnabled !== false,
      defaultFileName: stored.config.defaultFileName || null,
    }
    if (prefs.defaultFileName !== undefined) {
      if (prefs.defaultFileName !== null && !stored.config.images.some((item) => item.fileName === prefs.defaultFileName)) {
        throw new BadRequestException({ code: 'LOADING_IMAGE_INVALID', message: '指定的默认图片不在图片库中。' })
      }
      config.defaultFileName = prefs.defaultFileName || null
    }
    await this.prisma.organizationSetting.update({
      where: { organizationId_key: { organizationId, key: LOADING_IMAGES_KEY } },
      data: { value: JSON.stringify(config) },
    })
    const fresh = await this.readStored(organizationId)
    return fresh ? this.toDto(fresh) : { images: [], randomEnabled: true, defaultImageUrl: '', hasCustom: false }
  }
}
