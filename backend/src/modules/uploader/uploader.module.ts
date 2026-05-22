import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploaderService } from './uploader.service';
import { CookieManager } from './cookie-manager';
import { BrowserPool } from './browser-pool';
import { ContentModule } from '../content/content.module';
import { DouyinUploader } from './platforms/douyin.uploader';
import { WechatVideoUploader } from './platforms/wechat-video.uploader';
import { XiaohongshuUploader } from './platforms/xiaohongshu.uploader';
import { KuaishouUploader } from './platforms/kuaishou.uploader';
import { BilibiliUploader } from './platforms/bilibili.uploader';
import { WeiboUploader } from './platforms/weibo.uploader';

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
    XiaohongshuUploader,
    KuaishouUploader,
    BilibiliUploader,
    WeiboUploader,
  ],
  exports: [UploaderService, CookieManager, BrowserPool],
})
export class UploaderModule {}
