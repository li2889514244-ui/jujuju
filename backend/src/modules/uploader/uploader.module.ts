import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploaderService } from './uploader.service';
import { CookieManager } from './cookie-manager';
import { BrowserPool } from './browser-pool';
import { ContentModule } from '../content/content.module';
import { DouyinUploader } from './platforms/douyin.uploader';
import { WechatVideoUploader } from './platforms/wechat-video.uploader';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    forwardRef(() => ContentModule),
  ],
  providers: [
    UploaderService,
    CookieManager,
    BrowserPool,
    DouyinUploader,
    WechatVideoUploader,
  ],
  exports: [UploaderService, CookieManager, BrowserPool],
})
export class UploaderModule {}
