"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PixingVideoController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const pixing_video_service_1 = require("./pixing-video.service");
const create_task_dto_1 = require("./dto/create-task.dto");
let PixingVideoController = class PixingVideoController {
    constructor(service) {
        this.service = service;
    }
    createTask(userId, dto) {
        return this.service.createTask(userId, dto);
    }
    listTasks(userId, status) {
        return this.service.listTasks(userId, status);
    }
    getNextTask() {
        return this.service.getNextPendingTask();
    }
    getTask(id, userId) {
        return this.service.getTask(id, userId);
    }
    updateTask(id, dto) {
        return this.service.updateTask(id, dto);
    }
};
exports.PixingVideoController = PixingVideoController;
__decorate([
    (0, common_1.Post)('tasks'),
    (0, swagger_1.ApiOperation)({ summary: '创建视频生成任务' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_task_dto_1.CreateTaskDto]),
    __metadata("design:returntype", void 0)
], PixingVideoController.prototype, "createTask", null);
__decorate([
    (0, common_1.Get)('tasks'),
    (0, swagger_1.ApiOperation)({ summary: '获取我的任务列表' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)('id')),
    __param(1, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PixingVideoController.prototype, "listTasks", null);
__decorate([
    (0, common_1.Get)('tasks/next'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '[本地服务] 获取下一个待处理任务' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PixingVideoController.prototype, "getNextTask", null);
__decorate([
    (0, common_1.Get)('tasks/:id'),
    (0, swagger_1.ApiOperation)({ summary: '获取任务详情' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], PixingVideoController.prototype, "getTask", null);
__decorate([
    (0, common_1.Patch)('tasks/:id'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({ summary: '[本地服务] 更新任务状态' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_task_dto_1.UpdateTaskDto]),
    __metadata("design:returntype", void 0)
], PixingVideoController.prototype, "updateTask", null);
exports.PixingVideoController = PixingVideoController = __decorate([
    (0, swagger_1.ApiTags)('pixing-video'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('pixing-video'),
    __metadata("design:paramtypes", [pixing_video_service_1.PixingVideoService])
], PixingVideoController);
//# sourceMappingURL=pixing-video.controller.js.map