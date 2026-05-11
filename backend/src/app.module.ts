import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TeamsModule } from './modules/teams/teams.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { ContentModule } from './modules/content/content.module';
import { BrowserModule } from './modules/browser/browser.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AIModule } from './modules/ai/ai.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { HealthModule } from './modules/health/health.module';
import { CompetitorsModule } from './modules/competitors/competitors.module';
import { UploaderModule } from './modules/uploader/uploader.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { ContentReviewModule } from './modules/content-review/content-review.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ScanBindModule } from './modules/scan-bind/scan-bind.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import databaseConfig from './config/database.config';

@Module({
  imports: [
    // 全局配置模块
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [jwtConfig, redisConfig, databaseConfig],
    }),

    // 全局速率限制
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),

    // 基础设施模块
    PrismaModule,
    RedisModule,

    // 业务模块
    AuthModule,
    UsersModule,
    TeamsModule,
    AccountsModule,
    ContentModule,
    BrowserModule,
    AnalyticsModule,
    AIModule,
    PlatformsModule,
    HealthModule,
    CompetitorsModule,
    UploaderModule,
    SchedulerModule,
    ContentReviewModule,
    NotificationsModule,
    ScanBindModule,
  ],
  providers: [
    // #12 全局认证守卫 — 所有路由默认需要认证，@Public() 装饰器可豁免
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 全局速率限制守卫
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
