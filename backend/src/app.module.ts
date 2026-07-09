import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core'
import { RedisModule } from './redis/redis.module'
import { PrismaModule } from './prisma/prisma.module'
import { TenantModule } from './common/tenant/tenant.module'
import { TenantInterceptor } from './common/tenant/tenant.interceptor'
import { AuthModule } from './modules/auth/auth.module'
import { UsersModule } from './modules/users/users.module'
import { TeamsModule } from './modules/teams/teams.module'
import { AccountsModule } from './modules/accounts/accounts.module'
import { ContentModule } from './modules/content/content.module'
import { BrowserModule } from './modules/browser/browser.module'
import { AnalyticsModule } from './modules/analytics/analytics.module'
// AI module removed per user request
import { PlatformsModule } from './modules/platforms/platforms.module'
import { HealthModule } from './modules/health/health.module'
import { CompetitorsModule } from './modules/competitors/competitors.module'
import { SchedulerModule } from './modules/scheduler/scheduler.module'
import { ContentReviewModule } from './modules/content-review/content-review.module'
import { NotificationsModule } from './modules/notifications/notifications.module'
import { PixingVideoModule } from './modules/pixing-video/pixing-video.module'
import { McpModule } from './modules/mcp/mcp.module'
import { CalendarModule } from './modules/calendar/calendar.module'
import { ScanBindModule } from './modules/scan-bind/scan-bind.module'
import { WechatStoreModule } from './modules/wechat-store/wechat-store.module'
import { DoudianBrowserModule } from './modules/doudian-browser/doudian-browser.module'
import { AdminModule } from './modules/admin/admin.module'
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard'
import { RolesGuard } from './modules/auth/guards/roles.guard'
import { ServiceTokenGuard } from './modules/auth/guards/service-token.guard'
import jwtConfig from './config/jwt.config'
import redisConfig from './config/redis.config'
import databaseConfig from './config/database.config'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [jwtConfig, redisConfig, databaseConfig],
    }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },
      { name: 'medium', ttl: 10000, limit: 50 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),
    RedisModule,
    PrismaModule,
    TenantModule,
    AuthModule,
    UsersModule,
    TeamsModule,
    AccountsModule,
    ContentModule,
    BrowserModule,
    AnalyticsModule,
    PlatformsModule,
    HealthModule,
    CompetitorsModule,
    SchedulerModule,
    ContentReviewModule,
    NotificationsModule,
    PixingVideoModule,
    McpModule,
    CalendarModule,
    ScanBindModule,
    WechatStoreModule,
    DoudianBrowserModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ServiceTokenGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
