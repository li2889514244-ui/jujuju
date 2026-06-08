"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const publish_scheduler_1 = require("./publish.scheduler");
const data_sync_scheduler_1 = require("./data-sync.scheduler");
const content_module_1 = require("../content/content.module");
const uploader_module_1 = require("../uploader/uploader.module");
const notifications_module_1 = require("../notifications/notifications.module");
const prisma_module_1 = require("../../prisma/prisma.module");
const wechat_store_module_1 = require("../wechat-store/wechat-store.module");
const wechat_store_sync_scheduler_1 = require("./wechat-store-sync.scheduler");
let SchedulerModule = class SchedulerModule {
};
exports.SchedulerModule = SchedulerModule;
exports.SchedulerModule = SchedulerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            content_module_1.ContentModule,
            uploader_module_1.UploaderModule,
            notifications_module_1.NotificationsModule,
            wechat_store_module_1.WechatStoreModule,
        ],
        providers: [publish_scheduler_1.PublishScheduler, data_sync_scheduler_1.DataSyncScheduler, wechat_store_sync_scheduler_1.WechatStoreSyncScheduler],
        exports: [publish_scheduler_1.PublishScheduler, data_sync_scheduler_1.DataSyncScheduler, wechat_store_sync_scheduler_1.WechatStoreSyncScheduler],
    })
], SchedulerModule);
//# sourceMappingURL=scheduler.module.js.map