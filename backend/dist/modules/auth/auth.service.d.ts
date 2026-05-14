import { OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthService implements OnModuleInit {
    private prisma;
    private jwtService;
    private configService;
    private redis;
    private readonly logger;
    private jwtSecret;
    private jwtRefreshSecret;
    private jwtAccessExpires;
    private jwtRefreshExpires;
    constructor(prisma: PrismaService, jwtService: JwtService, configService: ConfigService, redis: RedisService);
    onModuleInit(): void;
    register(dto: RegisterDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            name: string;
            email: string;
            phone: string | null;
            id: string;
            role: string;
            status: string;
            createdAt: Date;
        };
    }>;
    login(dto: LoginDto): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
        };
    }>;
    validateUser(email: string, password: string): Promise<{
        id: string;
        email: string;
        phone: string | null;
        password: string;
        name: string;
        avatar: string | null;
        role: string;
        status: string;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        organizationId: string | null;
    } | null>;
    refreshTokens(refreshToken: string): Promise<{
        accessToken: string;
        refreshToken: string;
    }>;
    logout(refreshToken: string): Promise<{
        success: boolean;
        message: string;
    }>;
    private generateTokens;
    private validatePassword;
    getProfile(userId: string): Promise<{
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: string;
        status: string;
        lastLoginAt: Date | null;
        createdAt: Date;
    }>;
    updateProfile(userId: string, data: {
        name?: string;
        avatar?: string;
        phone?: string;
    }): Promise<{
        name: string;
        email: string;
        phone: string | null;
        id: string;
        avatar: string | null;
        role: string;
        status: string;
        lastLoginAt: Date | null;
        createdAt: Date;
    }>;
}
