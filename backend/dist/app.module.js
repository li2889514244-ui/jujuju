"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const prisma_module_1 = require("./prisma/prisma.module");
const redis_module_1 = require("./redis/redis.module");
const auth_module_1 = require("./modules/auth/auth.module");
const users_module_1 = require("./modules/users/users.module");
const teams_module_1 = require("./modules/teams/teams.module");
const accounts_module_1 = require("./modules/accounts/accounts.module");
const content_module_1 = require("./modules/content/content.module");
const browser_module_1 = require("./modules/browser/browser.module");
const analytics_module_1 = require("./modules/analytics/analytics.module");
const ai_module_1 = require("./modules/ai/ai.module");
const platforms_module_1 = require("./modules/platforms/platforms.module");
const health_module_1 = require("./modules/health/health.module");
const competitors_module_1 = require("./modules/competitors/competitors.module");
const uploader_module_1 = require("./modules/uploader/uploader.module");
const scheduler_module_1 = require("./modules/scheduler/scheduler.module");
const content_review_module_1 = require("./modules/content-review/content-review.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const jwt_auth_guard_1 = require("./modules/auth/guards/jwt-auth.guard");
const jwt_config_1 = require("./config/jwt.config");
const redis_config_1 = require("./config/redis.config");
const database_config_1 = require("./config/database.config");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: '.env',
                load: [jwt_config_1.default, redis_config_1.default, database_config_1.default],
            }),
            throttler_1.ThrottlerModule.forRoot([
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
            prisma_module_1.PrismaModule,
            redis_module_1.RedisModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            teams_module_1.TeamsModule,
            accounts_module_1.AccountsModule,
            content_module_1.ContentModule,
            browser_module_1.BrowserModule,
            analytics_module_1.AnalyticsModule,
            ai_module_1.AIModule,
            platforms_module_1.PlatformsModule,
            health_module_1.HealthModule,
            competitors_module_1.CompetitorsModule,
            uploader_module_1.UploaderModule,
            scheduler_module_1.SchedulerModule,
            content_review_module_1.ContentReviewModule,
            notifications_module_1.NotificationsModule,
        ],
        providers: [
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map