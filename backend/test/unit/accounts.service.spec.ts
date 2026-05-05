/**
 * AccountsService 单元测试
 * 测试账号服务的核心功能：CRUD 操作、Cookie 加密解密、权限控制
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AccountsService } from '../../src/modules/accounts/accounts.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockAccounts, mockUsers } from '../fixtures';
import { Platform } from '@prisma/client';

describe('AccountsService', () => {
  let service: AccountsService;

  beforeEach(async () => {
    resetPrismaMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 创建账号测试 ====================

  describe('create', () => {
    const createDto = {
      platform: Platform.DOUYIN,
      platformUserId: 'dy_new_user',
      nickname: '新抖音号',
      cookies: 'raw_cookie_data=test123',
    };

    it('应该成功创建新账号', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        ...createDto,
        id: 'acc-new',
        cookies: 'encrypted:data',
      });

      const result = await service.create(createDto, 'user-001');

      expect(result).toHaveProperty('id');
      expect(result.nickname).toBe(createDto.nickname);
      expect(mockPrismaService.account.create).toHaveBeenCalled();
    });

    it('应该对 Cookie 进行加密存储', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        cookies: 'iv:encrypted_hex_data',
      });

      await service.create(createDto, 'user-001');

      const createCall = mockPrismaService.account.create.mock.calls[0][0];
      // Cookie 应该被加密（格式为 iv:encrypted）
      expect(createCall.data.cookies).toContain(':');
      expect(createCall.data.cookies).not.toBe(createDto.cookies);
    });

    it('Cookie 为空时不应加密', async () => {
      const dtoWithoutCookies = { ...createDto, cookies: undefined };
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        cookies: null,
      });

      await service.create(dtoWithoutCookies, 'user-001');

      const createCall = mockPrismaService.account.create.mock.calls[0][0];
      expect(createCall.data.cookies).toBeNull();
    });

    it('平台账号已存在时应抛出 ConflictException', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);

      await expect(service.create(createDto, 'user-001')).rejects.toThrow(ConflictException);
      await expect(service.create(createDto, 'user-001')).rejects.toThrow('该平台账号已存在');
    });

    it('创建的账号应关联到正确的用户', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        userId: 'user-001',
      });

      await service.create(createDto, 'user-001');

      const createCall = mockPrismaService.account.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe('user-001');
    });

    it('返回的账号信息不应包含原始 Cookie', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        cookies: 'encrypted:data',
      });

      const result = await service.create(createDto, 'user-001');

      expect(result).not.toHaveProperty('cookies');
      expect(result).toHaveProperty('hasCookies', true);
    });
  });

  // ==================== 查询账号测试 ====================

  describe('findAll', () => {
    it('应该返回分页的账号列表', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        mockAccounts.douyin,
        mockAccounts.xiaohongshu,
      ]);
      mockPrismaService.account.count.mockResolvedValue(2);

      const result = await service.findAll({ userId: 'user-001' });

      expect(result.accounts).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result).toHaveProperty('skip', 0);
      expect(result).toHaveProperty('take', 20);
    });

    it('应该支持按平台筛选', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([mockAccounts.douyin]);
      mockPrismaService.account.count.mockResolvedValue(1);

      const result = await service.findAll({
        userId: 'user-001',
        platform: Platform.DOUYIN,
      });

      expect(mockPrismaService.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ platform: Platform.DOUYIN }),
        }),
      );
    });

    it('应该支持分页参数', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([]);
      mockPrismaService.account.count.mockResolvedValue(0);

      await service.findAll({ skip: 10, take: 5 });

      expect(mockPrismaService.account.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 5 }),
      );
    });

    it('返回的账号列表不应包含 Cookie 原文', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        { ...mockAccounts.douyin, cookies: 'secret_data', _count: { posts: 5 } },
      ]);
      mockPrismaService.account.count.mockResolvedValue(1);

      const result = await service.findAll({ userId: 'user-001' });

      expect(result.accounts[0]).not.toHaveProperty('cookies');
      expect(result.accounts[0]).toHaveProperty('hasCookies', true);
    });
  });

  // ==================== 查询单个账号测试 ====================

  describe('findById', () => {
    it('应该返回账号详情', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        posts: [],
        _count: { posts: 0 },
      });

      const result = await service.findById('acc-001');

      expect(result).toHaveProperty('id', 'acc-001');
      expect(result).toHaveProperty('platform', Platform.DOUYIN);
    });

    it('账号不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findById('nonexistent')).rejects.toThrow('账号不存在');
    });

    it('返回的详情应包含关联的文章', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        posts: [{ id: 'post-001', title: '测试', status: 'DRAFT', publishAt: null, createdAt: new Date() }],
        _count: { posts: 1 },
      });

      const result = await service.findById('acc-001');

      expect(result).toHaveProperty('posts');
      expect(result).toHaveProperty('_count');
    });
  });

  // ==================== 更新账号测试 ====================

  describe('update', () => {
    const updateDto = { nickname: '更新后的昵称' };

    it('账号所有者应能更新账号', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccounts.douyin,
        ...updateDto,
      });

      const result = await service.update('acc-001', updateDto, 'user-001');

      expect(result.nickname).toBe('更新后的昵称');
    });

    it('管理员应能更新任意账号', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccounts.douyin,
        ...updateDto,
      });

      const result = await service.update('acc-001', updateDto, 'user-002');

      expect(result.nickname).toBe('更新后的昵称');
    });

    it('非所有者且非管理员应被拒绝', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      await expect(
        service.update('acc-001', updateDto, 'user-other'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('更新 Cookie 时应重新加密', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.account.update.mockResolvedValue(mockAccounts.douyin);

      await service.update('acc-001', { cookies: 'new_cookie_data' }, 'user-001');

      const updateCall = mockPrismaService.account.update.mock.calls[0][0];
      expect(updateCall.data.cookies).toContain(':');
      expect(updateCall.data.cookies).not.toBe('new_cookie_data');
    });

    it('账号不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', updateDto, 'user-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== 删除账号测试 ====================

  describe('remove', () => {
    it('账号所有者应能删除账号', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.account.delete.mockResolvedValue(mockAccounts.douyin);

      const result = await service.remove('acc-001', 'user-001');

      expect(result).toEqual({ success: true });
      expect(mockPrismaService.account.delete).toHaveBeenCalledWith({
        where: { id: 'acc-001' },
      });
    });

    it('管理员应能删除任意账号', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.account.delete.mockResolvedValue(mockAccounts.douyin);

      const result = await service.remove('acc-001', 'user-002');

      expect(result).toEqual({ success: true });
    });

    it('非所有者且非管理员应被拒绝删除', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      await expect(
        service.remove('acc-001', 'user-other'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('账号不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);

      await expect(
        service.remove('nonexistent', 'user-001'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== Cookie 获取测试 ====================

  describe('getCookies', () => {
    it('账号所有者应能获取解密后的 Cookie', async () => {
      // 先创建一个加密的 Cookie
      const crypto = require('crypto');
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(
        process.env.COOKIE_ENCRYPTION_KEY || 'test-cookie-encryption-key-32bytes!',
        'salt',
        32,
      );
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update('raw_cookie_data', 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const encryptedCookie = iv.toString('hex') + ':' + encrypted;

      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        cookies: encryptedCookie,
      });

      const result = await service.getCookies('acc-001', 'user-001');

      expect(result.cookies).toBe('raw_cookie_data');
    });

    it('Cookie 为空时应返回 null', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        cookies: null,
      });

      const result = await service.getCookies('acc-001', 'user-001');

      expect(result.cookies).toBeNull();
    });

    it('非所有者且非管理员应被拒绝获取 Cookie', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      await expect(
        service.getCookies('acc-001', 'user-other'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== Cookie 加密解密测试 ====================

  describe('Cookie 加密解密', () => {
    it('加密后的内容应与原文不同', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue(mockAccounts.douyin);

      await service.create(
        {
          platform: Platform.DOUYIN,
          platformUserId: 'test',
          nickname: 'test',
          cookies: 'original_cookie',
        },
        'user-001',
      );

      const createCall = mockPrismaService.account.create.mock.calls[0][0];
      expect(createCall.data.cookies).not.toBe('original_cookie');
    });

    it('加密格式应为 iv:encrypted（hex 格式）', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue(mockAccounts.douyin);

      await service.create(
        {
          platform: Platform.DOUYIN,
          platformUserId: 'test',
          nickname: 'test',
          cookies: 'test_data',
        },
        'user-001',
      );

      const createCall = mockPrismaService.account.create.mock.calls[0][0];
      const parts = createCall.data.cookies.split(':');
      expect(parts).toHaveLength(2);
      // IV 应该是 32 个 hex 字符（16 字节）
      expect(parts[0]).toHaveLength(32);
    });

    it('相同明文多次加密应产生不同密文（随机 IV）', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue(mockAccounts.douyin);

      const cookies = 'same_cookie_data';

      await service.create(
        { platform: Platform.DOUYIN, platformUserId: 'test1', nickname: 'test1', cookies },
        'user-001',
      );
      await service.create(
        { platform: Platform.DOUYIN, platformUserId: 'test2', nickname: 'test2', cookies },
        'user-001',
      );

      const call1 = mockPrismaService.account.create.mock.calls[0][0];
      const call2 = mockPrismaService.account.create.mock.calls[1][0];
      expect(call1.data.cookies).not.toBe(call2.data.cookies);
    });
  });
});
