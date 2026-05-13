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
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
let RedisService = RedisService_1 = class RedisService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(RedisService_1.name);
        this.client = null;
        this.memoryFallback = new Map();
        this.useMemory = false;
        const isProd = process.env.NODE_ENV === 'production';
        const host = this.configService.get('REDIS_HOST');
        const redisUrl = this.configService.get('REDIS_URL');
        if (!host && redisUrl) {
            try {
                const parsed = new URL(redisUrl);
                this.logger.log(`从 REDIS_URL 解析连接: ${parsed.hostname}:${parsed.port}`);
                this.client = new ioredis_1.default({
                    host: parsed.hostname,
                    port: parseInt(parsed.port || '6379', 10),
                    password: parsed.password || undefined,
                    db: parseInt(parsed.pathname?.replace('/', '') || '0', 10),
                    maxRetriesPerRequest: 3,
                    retryStrategy: (times) => {
                        if (times > 3) {
                            if (isProd) {
                                this.logger.error('FATAL: Redis 连接失败，生产环境不允许内存 fallback');
                                process.exit(1);
                            }
                            this.logger.warn('Redis 连接失败超过 3 次，切换到内存 fallback');
                            this.useMemory = true;
                            return null;
                        }
                        return Math.min(times * 200, 2000);
                    },
                });
                this.setupEventListeners();
                return;
            }
            catch (err) {
                this.logger.warn(`REDIS_URL 解析失败: ${err.message}，尝试 REDIS_HOST`);
            }
        }
        if (!host) {
            if (isProd) {
                this.logger.error('FATAL: 生产环境必须配置 REDIS_URL 或 REDIS_HOST');
                process.exit(1);
            }
            this.logger.warn('REDIS_HOST 未配置，Redis 服务将使用内存 fallback（不适用于生产环境）');
            this.useMemory = true;
            return;
        }
        try {
            this.client = new ioredis_1.default({
                host,
                port: this.configService.get('REDIS_PORT', 6379),
                password: this.configService.get('REDIS_PASSWORD') || undefined,
                db: this.configService.get('REDIS_DB', 0),
                maxRetriesPerRequest: 3,
                retryStrategy: (times) => {
                    if (times > 3) {
                        if (isProd) {
                            this.logger.error('FATAL: Redis 连接失败，生产环境不允许内存 fallback');
                            process.exit(1);
                        }
                        this.logger.warn('Redis 连接失败超过 3 次，切换到内存 fallback');
                        this.useMemory = true;
                        return null;
                    }
                    return Math.min(times * 200, 2000);
                },
            });
            this.setupEventListeners();
        }
        catch (err) {
            this.logger.warn(`Redis 初始化失败: ${err.message}，使用内存 fallback`);
            this.useMemory = true;
        }
    }
    setupEventListeners() {
        if (!this.client)
            return;
        this.client.on('error', (err) => {
            this.logger.warn(`Redis 连接错误: ${err.message}，部分功能将使用内存 fallback`);
            this.useMemory = true;
        });
        this.client.on('connect', () => {
            this.logger.log('Redis 连接成功');
            this.useMemory = false;
        });
    }
    async onModuleDestroy() {
        if (this.client) {
            await this.client.quit();
        }
    }
    async get(key) {
        if (this.useMemory || !this.client) {
            const entry = this.memoryFallback.get(key);
            if (!entry)
                return null;
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
                this.memoryFallback.delete(key);
                return null;
            }
            return entry.value;
        }
        return this.client.get(key);
    }
    async set(key, value) {
        if (this.useMemory || !this.client) {
            this.memoryFallback.set(key, { value });
            return;
        }
        await this.client.set(key, value);
    }
    async setWithTTL(key, value, ttlSeconds) {
        if (this.useMemory || !this.client) {
            this.memoryFallback.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
            return;
        }
        await this.client.set(key, value, 'EX', ttlSeconds);
    }
    async del(key) {
        if (this.useMemory || !this.client) {
            this.memoryFallback.delete(key);
            return;
        }
        await this.client.del(key);
    }
    async exists(key) {
        if (this.useMemory || !this.client) {
            const entry = this.memoryFallback.get(key);
            if (!entry)
                return false;
            if (entry.expiresAt && Date.now() > entry.expiresAt) {
                this.memoryFallback.delete(key);
                return false;
            }
            return true;
        }
        const result = await this.client.exists(key);
        return result === 1;
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map