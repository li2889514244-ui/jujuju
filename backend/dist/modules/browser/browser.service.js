"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BrowserService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserService = void 0;
const common_1 = require("@nestjs/common");
let BrowserService = BrowserService_1 = class BrowserService {
    constructor() {
        this.logger = new common_1.Logger(BrowserService_1.name);
    }
    getInstances() {
        throw new common_1.NotImplementedException('浏览器引擎功能已禁用');
    }
    async createInstance(_accountId) {
        throw new common_1.NotImplementedException('浏览器引擎功能已禁用');
    }
    async closeInstance(_instanceId) {
        throw new common_1.NotImplementedException('浏览器引擎功能已禁用');
    }
    async setCookies(_instanceId, _cookies) {
        throw new common_1.NotImplementedException('浏览器引擎功能已禁用');
    }
    async executePublish(_instanceId, _platform, _content) {
        throw new common_1.NotImplementedException('浏览器引擎功能已禁用');
    }
    async screenshot(_instanceId) {
        throw new common_1.NotImplementedException('浏览器引擎功能已禁用');
    }
};
exports.BrowserService = BrowserService;
exports.BrowserService = BrowserService = BrowserService_1 = __decorate([
    (0, common_1.Injectable)()
], BrowserService);
//# sourceMappingURL=browser.service.js.map