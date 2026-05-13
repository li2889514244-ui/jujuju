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
var ScanBindGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanBindGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const scan_bind_service_1 = require("./scan-bind.service");
let ScanBindGateway = ScanBindGateway_1 = class ScanBindGateway {
    constructor(scanBindService, jwtService) {
        this.scanBindService = scanBindService;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(ScanBindGateway_1.name);
    }
    async handleConnection(client) {
        try {
            const token = client.handshake.auth?.token;
            if (!token) {
                client.emit('scan-error', { error: '未提供认证信息' });
                client.disconnect();
                return;
            }
            const payload = this.jwtService.verify(token);
            client.userId = payload.sub;
            this.logger.debug(`客户端连接: ${client.id}, userId: ${payload.sub}`);
        }
        catch {
            client.emit('scan-error', { error: '认证失败，请重新登录' });
            client.disconnect();
        }
    }
    handleDisconnect(client) {
        this.logger.debug(`客户端断开: ${client.id}`);
        this.scanBindService.cancelSession(client.id);
    }
    async handleStartScan(client, payload) {
        const userId = client.userId || payload.userId;
        if (!userId) {
            client.emit('scan-error', { error: '无法识别用户身份' });
            return;
        }
        this.logger.log(`开始扫码绑定: ${payload.platform} (client: ${client.id}, user: ${userId})`);
        try {
            await this.scanBindService.startScanSession({
                clientId: client.id,
                platform: payload.platform,
                userId,
                onQrCode: (imageBase64) => {
                    client.emit('qr-code', { image: imageBase64 });
                },
                onStatus: (status, message) => {
                    client.emit('scan-status', { status, message });
                },
                onSuccess: (accountData) => {
                    client.emit('scan-success', accountData);
                },
                onError: (error) => {
                    client.emit('scan-error', { error });
                },
            });
        }
        catch (error) {
            this.logger.error(`扫码绑定异常: ${error.message}`);
            client.emit('scan-error', { error: error.message });
        }
    }
    handleCancelScan(client) {
        this.logger.log(`取消扫码: ${client.id}`);
        this.scanBindService.cancelSession(client.id);
    }
};
exports.ScanBindGateway = ScanBindGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ScanBindGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('start-scan'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ScanBindGateway.prototype, "handleStartScan", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('cancel-scan'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], ScanBindGateway.prototype, "handleCancelScan", null);
exports.ScanBindGateway = ScanBindGateway = ScanBindGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        namespace: '/scan-bind',
        cors: {
            origin: process.env.CORS_ORIGINS?.split(',') || process.env.CORS_ORIGIN?.split(',') || [
                'http://localhost:5173',
                'http://localhost:3000',
                'https://jujuju-28b.pages.dev',
            ],
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [scan_bind_service_1.ScanBindService,
        jwt_1.JwtService])
], ScanBindGateway);
//# sourceMappingURL=scan-bind.gateway.js.map