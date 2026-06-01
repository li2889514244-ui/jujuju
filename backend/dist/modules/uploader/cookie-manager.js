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
var CookieManager_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieManager = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const crypto_1 = require("crypto");
const config_1 = require("@nestjs/config");
let CookieManager = CookieManager_1 = class CookieManager {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
        this.logger = new common_1.Logger(CookieManager_1.name);
        this.algorithm = 'aes-256-gcm';
        const key = this.config.get('COOKIE_ENCRYPTION_KEY') || '';
        if (key.length >= 32) {
            this.encryptionKey = Buffer.from(key.slice(0, 32));
        }
        else {
            this.logger.warn('COOKIE_ENCRYPTION_KEY 未配置或长度不足，使用默认密钥（仅限开发环境）');
            this.encryptionKey = Buffer.from('matrixflow-dev-key-32bytes!!!!!');
        }
    }
    encrypt(data) {
        const iv = (0, crypto_1.randomBytes)(16);
        const cipher = (0, crypto_1.createCipheriv)(this.algorithm, this.encryptionKey, iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    }
    decrypt(encryptedData) {
        const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = (0, crypto_1.createDecipheriv)(this.algorithm, this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    async saveCookies(accountId, cookies) {
        const encrypted = this.encrypt(JSON.stringify(cookies));
        await this.prisma.account.update({
            where: { id: accountId },
            data: { cookies: encrypted },
        });
        this.logger.log(`Cookie 已保存: accountId=${accountId}, count=${cookies.length}`);
    }
    async loadCookies(accountId) {
        const account = await this.prisma.account.findUnique({
            where: { id: accountId },
            select: { cookies: true },
        });
        if (!account?.cookies)
            return null;
        try {
            const decrypted = this.decrypt(account.cookies);
            return JSON.parse(decrypted);
        }
        catch (e) {
            this.logger.error(`Cookie 解密失败: accountId=${accountId}`, e);
            return null;
        }
    }
    decryptCookie(encrypted) {
        try {
            return JSON.parse(this.decrypt(encrypted));
        }
        catch {
            return [];
        }
    }
    async clearCookies(accountId) {
        await this.prisma.account.update({
            where: { id: accountId },
            data: { cookies: null },
        });
        this.logger.log(`Cookie 已清除: accountId=${accountId}`);
    }
};
exports.CookieManager = CookieManager;
exports.CookieManager = CookieManager = CookieManager_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], CookieManager);
//# sourceMappingURL=cookie-manager.js.map