import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import {
  OrganizationSettingsService,
  type UploadedImageFile,
} from './organization-settings.service'

@Controller('organization-settings')
export class OrganizationSettingsController {
  constructor(private readonly organizationSettingsService: OrganizationSettingsService) {}

  /** 当前组织的刷新动画图片库配置（鉴权） */
  @Get('loading')
  getLoadingImageConfig(@CurrentUser() user: any) {
    return this.organizationSettingsService.getLoadingImageConfig(user)
  }

  /** 批量上传刷新动画图片（PNG/JPG/JPEG/WEBP，单张 ≤3MB，一次最多 10 张） */
  @Put('loading')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 3 * 1024 * 1024 } }))
  uploadLoadingImages(
    @CurrentUser() user: any,
    @UploadedFiles() files: UploadedImageFile[] | undefined,
    @Body() _body: Record<string, unknown>,
  ) {
    return this.organizationSettingsService.uploadLoadingImages(user, files)
  }

  /** 删除单张图片 */
  @Delete('loading/:fileName')
  deleteLoadingImage(@CurrentUser() user: any, @Param('fileName') fileName: string) {
    return this.organizationSettingsService.deleteLoadingImage(user, fileName)
  }

  /** 清空图片库 / 恢复默认 */
  @Delete('loading')
  resetLoadingImages(@CurrentUser() user: any) {
    return this.organizationSettingsService.resetLoadingImages(user)
  }

  /** 随机播放开关 / 指定默认图 */
  @Patch('loading/prefs')
  updateLoadingPrefs(
    @CurrentUser() user: any,
    @Body() body: { randomEnabled?: boolean; defaultFileName?: string | null },
  ) {
    return this.organizationSettingsService.updateLoadingPrefs(user, body)
  }
}
