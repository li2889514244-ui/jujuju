"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploaderModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../../prisma/prisma.module");
const uploader_service_1 = require("./uploader.service");
const cookie_manager_1 = require("./cookie-manager");
const browser_pool_1 = require("./browser-pool");
const content_module_1 = require("../content/content.module");
const douyin_uploader_1 = require("./platforms/douyin.uploader");
const wechat_video_uploader_1 = require("./platforms/wechat-video.uploader");
const xiaohongshu_uploader_1 = require("./platforms/xiaohongshu.uploader");
const kuaishou_uploader_1 = require("./platforms/kuaishou.uploader");
const bilibili_uploader_1 = require("./platforms/bilibili.uploader");
const weibo_uploader_1 = require("./platforms/weibo.uploader");
let UploaderModule = class UploaderModule {
};
exports.UploaderModule = UploaderModule;
exports.UploaderModule = UploaderModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule,
            prisma_module_1.PrismaModule,
            (0, common_1.forwardRef)(() => content_module_1.ContentModule),
        ],
        providers: [
            uploader_service_1.UploaderService,
            cookie_manager_1.CookieManager,
            browser_pool_1.BrowserPool,
            douyin_uploader_1.DouyinUploader,
            wechat_video_uploader_1.WechatVideoUploader,
            xiaohongshu_uploader_1.XiaohongshuUploader,
            kuaishou_uploader_1.KuaishouUploader,
            bilibili_uploader_1.BilibiliUploader,
            weibo_uploader_1.WeiboUploader,
        ],
        exports: [uploader_service_1.UploaderService, cookie_manager_1.CookieManager, browser_pool_1.BrowserPool],
    })
], UploaderModule);
//# sourceMappingURL=uploader.module.js.map