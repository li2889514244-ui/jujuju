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
var McpController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpController = void 0;
const common_1 = require("@nestjs/common");
const mcp_service_1 = require("./mcp.service");
let McpController = McpController_1 = class McpController {
    constructor(mcpService) {
        this.mcpService = mcpService;
        this.logger = new common_1.Logger(McpController_1.name);
    }
    async query(body) {
        this.logger.log(`MCP query: ${body.query || body.toolName || '(direct call)'}`);
        return this.mcpService.handleQuery(body);
    }
    getTools() {
        return {
            success: true,
            data: this.mcpService.getTools(),
        };
    }
};
exports.McpController = McpController;
__decorate([
    (0, common_1.Post)('query'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], McpController.prototype, "query", null);
__decorate([
    (0, common_1.Get)('tools'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], McpController.prototype, "getTools", null);
exports.McpController = McpController = McpController_1 = __decorate([
    (0, common_1.Controller)('api/mcp'),
    __metadata("design:paramtypes", [mcp_service_1.McpService])
], McpController);
//# sourceMappingURL=mcp.controller.js.map