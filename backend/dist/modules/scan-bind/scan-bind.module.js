"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScanBindModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const scan_bind_gateway_1 = require("./scan-bind.gateway");
const scan_bind_service_1 = require("./scan-bind.service");
const uploader_module_1 = require("../uploader/uploader.module");
const prisma_module_1 = require("../../prisma/prisma.module");
let ScanBindModule = class ScanBindModule {
};
exports.ScanBindModule = ScanBindModule;
exports.ScanBindModule = ScanBindModule = __decorate([
    (0, common_1.Module)({
        imports: [
            uploader_module_1.UploaderModule,
            prisma_module_1.PrismaModule,
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    secret: config.get('jwt.secret'),
                    signOptions: { expiresIn: config.get('jwt.expiresIn', '7d') },
                }),
            }),
        ],
        providers: [scan_bind_gateway_1.ScanBindGateway, scan_bind_service_1.ScanBindService],
        exports: [scan_bind_service_1.ScanBindService],
    })
], ScanBindModule);
//# sourceMappingURL=scan-bind.module.js.map