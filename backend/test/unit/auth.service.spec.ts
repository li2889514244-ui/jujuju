/**
 * AuthService 单元测试
 * 测试认证服务的核心功能：注册、登录、Token 刷新、用户验证
 */

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../../src/modules/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockUsers } from '../fixtures';
import { createMockConfigService } from '../helpers/test-helpers';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: typeof mockPrismaService;
  let jwtService: JwtService;

  beforeEach(async () => {
    resetPrismaMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        JwtService,
        { provide: ConfigService, useValue: createMockConfigService() },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = mockPrismaService;
    jwtService = module.get<JwtService>(JwtService);

    // Mock bcrypt
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('$2a$10$hashedpassword' as never);
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 注册测试 ====================

  describe('register', () => {
    const registerDto = {
      email: 'newuser@example.com',
      password: 'Test123456',
      name: '新用户',
      phone: '13800138000',
    };

    it('应该成功注册新用户', async () => {
      // 准备：邮箱不存在
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...mockUsers.regular,
        ...registerDto,
        id: 'user-new',
      });

      const result = await service.register(registerDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(registerDto.email);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('应该对密码进行 bcrypt 哈希', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(mockUsers.regular);

      await service.register(registerDto);

      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
    });

    it('应该在邮箱已存在时抛出 ConflictException', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      await expect(service.register(registerDto)).rejects.toThrow('该邮箱已被注册');
    });

    it('注册成功后应返回 JWT Token 对', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...mockUsers.regular,
        id: 'user-new',
      });

      const result = await service.register(registerDto);

      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.accessToken.length).toBeGreaterThan(0);
      expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('注册返回的用户信息不应包含密码', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-new',
        email: registerDto.email,
        name: registerDto.name,
        phone: registerDto.phone,
        role: 'MEMBER',
        status: 'ACTIVE',
        createdAt: new Date(),
      });

      const result = await service.register(registerDto);

      expect(result.user).not.toHaveProperty('password');
    });
  });

  // ==================== 登录测试 ====================

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Test123456',
    };

    it('应该成功登录已注册的用户', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular);
      prisma.user.update.mockResolvedValue(mockUsers.regular);

      const result = await service.login(loginDto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe(loginDto.email);
    });

    it('应该更新用户的最后登录时间', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular);
      prisma.user.update.mockResolvedValue(mockUsers.regular);

      await service.login(loginDto);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUsers.regular.id },
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        }),
      );
    });

    it('密码错误时应抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('邮箱或密码错误');
    });

    it('用户不存在时应抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('被禁用的用户登录应抛出 UnauthorizedException', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.suspended);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow('用户账号已被禁用');
    });

    it('登录返回的用户信息应包含基本字段', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular);
      prisma.user.update.mockResolvedValue(mockUsers.regular);

      const result = await service.login(loginDto);

      expect(result.user).toHaveProperty('id');
      expect(result.user).toHaveProperty('email');
      expect(result.user).toHaveProperty('name');
      expect(result.user).toHaveProperty('role');
      expect(result.user).not.toHaveProperty('password');
    });
  });

  // ==================== 用户验证测试 ====================

  describe('validateUser', () => {
    it('验证通过应返回用户对象', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular);

      const result = await service.validateUser('test@example.com', 'Test123456');

      expect(result).toBeDefined();
      expect(result!.id).toBe(mockUsers.regular.id);
    });

    it('用户不存在时应返回 null', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('nonexistent@example.com', 'Test123456');

      expect(result).toBeNull();
    });

    it('密码不匹配时应返回 null', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.regular);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      const result = await service.validateUser('test@example.com', 'wrongpassword');

      expect(result).toBeNull();
    });

    it('被禁用的用户应抛出异常', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUsers.suspended);

      await expect(
        service.validateUser('suspended@example.com', 'Test123456'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== Token 刷新测试 ====================

  describe('refreshTokens', () => {
    it('使用有效的 Refresh Token 应返回新的 Token 对', async () => {
      // 先生成一个真实的 Refresh Token
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: 'test-jwt-refresh-secret', expiresIn: '7d' },
      );

      prisma.user.findUnique.mockResolvedValue(mockUsers.regular);

      const result = await service.refreshTokens(refreshToken);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(typeof result.accessToken).toBe('string');
      expect(typeof result.refreshToken).toBe('string');
    });

    it('使用过期的 Refresh Token 应抛出 UnauthorizedException', async () => {
      // 生成一个已过期的 Token
      const expiredToken = jwtService.sign(
        { sub: mockUsers.regular.id, email: mockUsers.regular.email },
        { secret: 'test-jwt-refresh-secret', expiresIn: '0s' },
      );

      // 等待 Token 过期
      await new Promise((resolve) => setTimeout(resolve, 100));

      await expect(service.refreshTokens(expiredToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens(expiredToken)).rejects.toThrow('刷新令牌已过期或无效');
    });

    it('使用无效的 Refresh Token 应抛出 UnauthorizedException', async () => {
      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('用户已被禁用时刷新 Token 应失败', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: mockUsers.suspended.id, email: mockUsers.suspended.email },
        { secret: 'test-jwt-refresh-secret', expiresIn: '7d' },
      );

      prisma.user.findUnique.mockResolvedValue(mockUsers.suspended);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow('无效的刷新令牌');
    });

    it('用户不存在时刷新 Token 应失败', async () => {
      const refreshToken = await jwtService.signAsync(
        { sub: 'nonexistent-user', email: 'ghost@example.com' },
        { secret: 'test-jwt-refresh-secret', expiresIn: '7d' },
      );

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ==================== Token 生成测试 ====================

  describe('generateTokens (私有方法，通过 register 间接测试)', () => {
    it('生成的 Access Token 应包含正确的 payload', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...mockUsers.regular,
        id: 'user-new',
      });

      const result = await service.register({
        email: 'new@example.com',
        password: 'Test123456',
        name: '新用户',
      });

      // 解码 Access Token 验证 payload
      const payload = jwtService.decode(result.accessToken) as any;
      expect(payload.sub).toBe('user-new');
      expect(payload.email).toBe('new@example.com');
    });

    it('生成的 Refresh Token 应包含正确的 payload', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...mockUsers.regular,
        id: 'user-new',
      });

      const result = await service.register({
        email: 'new@example.com',
        password: 'Test123456',
        name: '新用户',
      });

      const payload = jwtService.decode(result.refreshToken) as any;
      expect(payload.sub).toBe('user-new');
      expect(payload.email).toBe('new@example.com');
    });

    it('Access Token 和 Refresh Token 应该不同', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        ...mockUsers.regular,
        id: 'user-new',
      });

      const result = await service.register({
        email: 'new@example.com',
        password: 'Test123456',
        name: '新用户',
      });

      expect(result.accessToken).not.toBe(result.refreshToken);
    });
  });
});
