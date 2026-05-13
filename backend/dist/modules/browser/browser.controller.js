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
exports.BrowserController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const browser_service_1 = require("./browser.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const roles_guard_1 = require("../auth/guards/roles.guard");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const client_1 = require("@prisma/client");
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
class CreateBrowserInstanceDto {
}
__decorate([
    (0, swagger_2.ApiProperty)({ description: '关联账号ID' }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBrowserInstanceDto.prototype, "accountId", void 0);
let BrowserController = class BrowserController {
    constructor(browserService) {
        this.browserService = browserService;
    }
    getInstances() {
        return this.browserService.getInstances();
    }
    async createInstance(dto) {
        return this.browserService.createInstance(dto.accountId);
    }
    async closeInstance(id) {
        await this.browserService.closeInstance(id);
        return { success: true };
    }
};
exports.BrowserController = BrowserController;
__decorate([
    (0, common_1.Get)('instances'),
    (0, swagger_1.ApiOperation)({ summary: '获取浏览器实例列表' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Array)
], BrowserController.prototype, "getInstances", null);
__decorate([
    (0, common_1.Post)('instances'),
    (0, roles_decorator_1.Roles)(client_1.Role.OWNER, client_1.Role.ADMIN, client_1.Role.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: '创建浏览器实例' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: '创建成功' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateBrowserInstanceDto]),
    __metadata("design:returntype", Promise)
], BrowserController.prototype, "createInstance", null);
__decorate([
    (0, common_1.Delete)('instances/:id'),
    (0, roles_decorator_1.Roles)(client_1.Role.OWNER, client_1.Role.ADMIN, client_1.Role.MANAGER),
    (0, swagger_1.ApiOperation)({ summary: '关闭浏览器实例' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], BrowserController.prototype, "closeInstance", null);
exports.BrowserController = BrowserController = __decorate([
    (0, swagger_1.ApiTags)('browser'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    (0, common_1.Controller)('browser'),
    __metadata("design:paramtypes", [browser_service_1.BrowserService])
], BrowserController);
//# sourceMappingURL=browser.controller.js.map