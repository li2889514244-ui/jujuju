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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = require("bcryptjs");
const prisma_service_1 = require("../../prisma/prisma.service");
const redis_service_1 = require("../../redis/redis.service");
const BCRYPT_ROUNDS = 12;
let AuthService = AuthService_1 = class AuthService {
    constructor(prisma, jwtService, configService, redis) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.configService = configService;
        this.redis = redis;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    onModuleInit() {
        this.jwtSecret = this.configService.get('JWT_SECRET');
        this.jwtRefreshSecret = this.configService.get('JWT_REFRESH_SECRET');
        this.jwtAccessExpires = this.configService.get('JWT_ACCESS_EXPIRES', '15m');
        this.jwtRefreshExpires = this.configService.get('JWT_REFRESH_EXPIRES', '7d');
        if (!this.jwtSecret || !this.jwtRefreshSecret) {
            throw new Error('JWT_SECRET and JWT_REFRESH_SECRET must be configured. Check your .env file.');
        }
    }
    async register(dto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email },
        });
        if (existingUser) {
            throw new common_1.ConflictException('该邮箱已被注册');
        }
        this.validatePassword(dto.password);
        const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
        const user = await this.prisma.user.create({
            data: {
                email: dto.email,
                password: hashedPassword,
                name: dto.name,
                phone: dto.phone,
            },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                status: true,
                createdAt: true,
            },
        });
        this.logger.log(`用户注册成功: ${user.email}`);
        const tokens = await this.generateTokens(user.id, user.email);
        return { user, ...tokens };
    }
    async login(dto) {
        const user = await this.validateUser(dto.email, dto.password);
        if (!user) {
            throw new common_1.UnauthorizedException('邮箱或密码错误');
        }
        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        this.logger.log(`用户登录成功: ${user.email}`);
        const tokens = await this.generateTokens(user.id, user.email);
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
            ...tokens,
        };
    }
    async validateUser(email, password) {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });
        if (!user) {
            return null;
        }
        if (user.status !== 'ACTIVE') {
            throw new common_1.UnauthorizedException('用户账号已被禁用');
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return null;
        }
        return user;
    }
    async refreshTokens(refreshToken) {
        try {
            const isBlacklisted = await this.redis.exists(`token:blacklist:${refreshToken}`);
            if (isBlacklisted) {
                throw new common_1.UnauthorizedException('刷新令牌已被吊销');
            }
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.jwtRefreshSecret,
            });
            const user = await this.prisma.user.findUnique({
                where: { id: payload.sub },
            });
            if (!user || user.status !== 'ACTIVE') {
                throw new common_1.UnauthorizedException('无效的刷新令牌');
            }
            await this.redis.setWithTTL(`token:blacklist:${refreshToken}`, '1', 7 * 24 * 60 * 60);
            const tokens = await this.generateTokens(user.id, user.email);
            return tokens;
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            throw new common_1.UnauthorizedException('刷新令牌已过期或无效');
        }
    }
    async logout(refreshToken) {
        try {
            this.jwtService.verify(refreshToken, {
                secret: this.jwtRefreshSecret,
            });
        }
        catch {
        }
        await this.redis.setWithTTL(`token:blacklist:${refreshToken}`, '1', 7 * 24 * 60 * 60);
        this.logger.log('用户登出成功，refresh token 已吊销');
        return { success: true, message: '登出成功' };
    }
    async generateTokens(userId, email) {
        const payload = { sub: userId, email };
        const [accessToken, refreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: this.jwtSecret,
                expiresIn: this.jwtAccessExpires,
            }),
            this.jwtService.signAsync(payload, {
                secret: this.jwtRefreshSecret,
                expiresIn: this.jwtRefreshExpires,
            }),
        ]);
        return { accessToken, refreshToken };
    }
    validatePassword(password) {
        const errors = [];
        if (password.length < 8) {
            errors.push('密码长度不能少于8个字符');
        }
        if (!/[A-Z]/.test(password)) {
            errors.push('密码必须包含至少一个大写字母');
        }
        if (!/[a-z]/.test(password)) {
            errors.push('密码必须包含至少一个小写字母');
        }
        if (!/[0-9]/.test(password)) {
            errors.push('密码必须包含至少一个数字');
        }
        if (errors.length > 0) {
            throw new common_1.ConflictException(errors.join('; '));
        }
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
                phone: true,
                role: true,
                status: true,
                lastLoginAt: true,
                createdAt: true,
            },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('用户不存在');
        }
        return user;
    }
    async updateProfile(userId, data) {
        const updateData = {};
        if (data.name)
            updateData.name = data.name;
        if (data.avatar)
            updateData.avatar = data.avatar;
        if (data.phone)
            updateData.phone = data.phone;
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
                phone: true,
                role: true,
                status: true,
                lastLoginAt: true,
                createdAt: true,
            },
        });
        this.logger.log(`用户资料更新: ${userId}`);
        return user;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        redis_service_1.RedisService])
], AuthService);
//# sourceMappingURL=auth.service.js.map