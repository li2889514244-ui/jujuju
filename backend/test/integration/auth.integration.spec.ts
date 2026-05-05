/**
 * Auth 集成测试
 * 测试认证流程的端到端交互，包括模块装配和依赖注入
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../../src/modules/auth/auth.service';
import { AuthController } from '../../src/modules/auth/auth.controller';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockUsers } from '../fixtures';
import { createMockConfigService } from '../helpers/test-helpers';

describe('Auth 集成测试', () => {
  let authService: AuthService;
  let authController: AuthController;
  let jwtService: JwtService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        JwtService,
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    authController = module.get<AuthController>(AuthController);
    jwtService = module.get<JwtService>(JwtService);
  });

  beforeEach(() => {
    resetPrismaMocks();
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$10$hashed' as never);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 注册流程测试 ====================

  describe('完整注册流程', () => {
    it('应通过 Controller 完成注册并返回 Token', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-new',
        email: 'new@example.com',
        name: '新用户',
        phone: '13800138000',
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      // Controller 签名: register(dto: RegisterDto)
      const result = await authController.register({
        email: 'new@example.com',
        password: 'Test123456',
        name: '新用户',
        phone: '13800138000',
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('new@example.com');
    });

    it('重复注册应返回 409 错误', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      await expect(
        authController.register({
          email: 'test@example.com',
          password: 'Test123456',
          name: '重复用户',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==================== 登录流程测试 ====================

  describe('完整登录流程', () => {
    it('应通过 Controller 完成登录', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      mockPrismaService.user.update.mockResolvedValue(mockUsers.regular);

      // Controller 签名: login(dto: LoginDto)
      const result = await authController.login({
        email: 'test@example.com',
        password: 'Test123456',
      });

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('错误密码应返回 401 错误', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        authController.login({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== Token 刷新流程测试 ====================

  describe('Token 刷新流程', () => {
    it('应通过有效 Refresh Token 获取新的 Token 对', async () => {
      // Controller 签名: refresh(dto: RefreshTokenDto)
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: 'test-jwt-refresh-secret', expiresIn: '7d' },
      );

      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      const result = await authController.refresh({ refreshToken });

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      // 新 Token 应与旧的不同
      expect(result.refreshToken).not.toBe(refreshToken);
    });

    it('过期的 Refresh Token 应返回 401 错误', async () => {
      const expiredToken = jwtService.sign(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: 'test-jwt-refresh-secret', expiresIn: '0s' },
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(
        authController.refresh({ refreshToken: expiredToken }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== 登录 -> 刷新 -> 登出 流程测试 ====================

  describe('完整认证生命周期', () => {
    it('应支持 登录 -> 刷新Token -> 使用新Token 的完整流程', async () => {
      // 1. 登录
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      mockPrismaService.user.update.mockResolvedValue(mockUsers.regular);

      const loginResult = await authService.login({
        email: 'test@example.com',
        password: 'Test123456',
      });

      expect(loginResult.accessToken).toBeDefined();
      expect(loginResult.refreshToken).toBeDefined();

      // 2. 使用 Refresh Token 刷新
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      const refreshResult = await authService.refreshTokens(loginResult.refreshToken);

      expect(refreshResult.accessToken).toBeDefined();
      expect(refreshResult.refreshToken).toBeDefined();

      // 3. 验证新 Access Token 可用
      const payload = jwtService.decode(refreshResult.accessToken) as any;
      expect(payload.sub).toBe(mockUsers.regular.id);
      expect(payload.email).toBe(mockUsers.regular.email);
    });

    it('被禁用用户在刷新 Token 时应被拦截', async () => {
      // 先生成一个 Token
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.suspended.id, email: mockUsers.suspended.email },
        { secret: 'test-jwt-refresh-secret', expiresIn: '7d' },
      );

      // 用户在 Token 有效期内被禁用
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.suspended);

      await expect(authService.refreshTokens(refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
