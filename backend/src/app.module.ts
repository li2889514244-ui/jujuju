import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RedisModule } from './redis/redis.module';
import { PrismaModule } from './prisma/prisma.module';
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
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { ContentReviewModule } from './modules/content-review/content-review.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PixingVideoModule } from './modules/pixing-video/pixing-video.module';
import { McpModule } from './modules/mcp/mcp.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import databaseConfig from './config/database.config';

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
    SchedulerModule,
    ContentReviewModule,
    NotificationsModule,
    PixingVideoModule,
    McpModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
