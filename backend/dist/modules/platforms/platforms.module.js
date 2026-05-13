"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformsModule = void 0;
const common_1 = require("@nestjs/common");
const platforms_controller_1 = require("./platforms.controller");
const platforms_service_1 = require("./platforms.service");
const oauth_service_1 = require("./oauth/oauth.service");
const oauth_controller_1 = require("./oauth/oauth.controller");
const oauth_callback_handler_1 = require("./oauth/oauth-callback.handler");
const prisma_module_1 = require("../../prisma/prisma.module");
const douyin_collector_1 = require("./collectors/douyin.collector");
const kuaishou_collector_1 = require("./collectors/kuaishou.collector");
const xiaohongshu_collector_1 = require("./collectors/xiaohongshu.collector");
const shipinhao_collector_1 = require("./collectors/shipinhao.collector");
const bilibili_collector_1 = require("./collectors/bilibili.collector");
const weibo_collector_1 = require("./collectors/weibo.collector");
let PlatformsModule = class PlatformsModule {
};
exports.PlatformsModule = PlatformsModule;
exports.PlatformsModule = PlatformsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule],
        controllers: [platforms_controller_1.PlatformsController, oauth_controller_1.OAuthController],
        providers: [
            platforms_service_1.PlatformsService,
            oauth_service_1.OAuthService,
            oauth_callback_handler_1.OAuthCallbackHandler,
            douyin_collector_1.DouyinCollector,
            kuaishou_collector_1.KuaishouCollector,
            xiaohongshu_collector_1.XiaohongshuCollector,
            shipinhao_collector_1.ShipinhaoCollector,
            bilibili_collector_1.BilibiliCollector,
            weibo_collector_1.WeiboCollector,
        ],
        exports: [platforms_service_1.PlatformsService, oauth_service_1.OAuthService],
    })
], PlatformsModule);
//# sourceMappingURL=platforms.module.js.map