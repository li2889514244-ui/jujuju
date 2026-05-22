/**
 * 平台集成模块
 * 聚合所有平台相关组件
 */

import { Module } from '@nestjs/common';
import { PlatformsController } from './platforms.controller';
import { PlatformsService } from './platforms.service';
import { OAuthService } from './oauth/oauth.service';
import { OAuthController } from './oauth/oauth.controller';
import { OAuthCallbackHandler } from './oauth/oauth-callback.handler';
import { PrismaModule } from '../../prisma/prisma.module';

// 数据采集器
import { DouyinCollector } from './collectors/douyin.collector';
import { KuaishouCollector } from './collectors/kuaishou.collector';
import { XiaohongshuCollector } from './collectors/xiaohongshu.collector';
import { ShipinhaoCollector } from './collectors/shipinhao.collector';
import { BilibiliCollector } from './collectors/bilibili.collector';
import { WeiboCollector } from './collectors/weibo.collector';

@Module({
  imports: [PrismaModule],
  controllers: [PlatformsController, OAuthController],
  providers: [
    // 核心服务
    PlatformsService,
    OAuthService,
    OAuthCallbackHandler,

    // 数据采集器
    DouyinCollector,
    KuaishouCollector,
    XiaohongshuCollector,
    ShipinhaoCollector,
    BilibiliCollector,
    WeiboCollector,
  ],
  exports: [PlatformsService, OAuthService],
})
export class PlatformsModule {}
