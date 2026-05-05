/**
 * Accounts 集成测试
 * 测试账号管理 API 的端到端交互
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AccountsService } from '../../src/modules/accounts/accounts.service';
import { AccountsController } from '../../src/modules/accounts/accounts.controller';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockAccounts, mockUsers } from '../fixtures';
import { Platform, AccountStatus } from '@prisma/client';

describe('Accounts 集成测试', () => {
  let accountsService: AccountsService;
  let accountsController: AccountsController;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    accountsService = module.get<AccountsService>(AccountsService);
    accountsController = module.get<AccountsController>(AccountsController);
  });

  beforeEach(() => {
    resetPrismaMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 创建账号 API 测试 ====================

  describe('POST /accounts', () => {
    it('应通过 Controller 创建账号', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-new',
      });

      // Controller 签名: create(dto, userId)，userId 通过 @CurrentUser('id') 注入
      const result = await accountsController.create(
        {
          platform: Platform.DOUYIN,
          platformUserId: 'dy_new',
          nickname: '新抖音号',
          cookies: 'test_cookie',
        },
        'user-001', // @CurrentUser('id')
      );

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('hasCookies', true);
    });

    it('重复创建应返回 409 错误', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);

      await expect(
        accountsController.create(
          {
            platform: Platform.DOUYIN,
            platformUserId: 'dy_user_001',
            nickname: '重复',
          },
          'user-001',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==================== 查询账号列表 API 测试 ====================

  describe('GET /accounts', () => {
    it('应返回分页的账号列表', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        mockAccounts.douyin,
        mockAccounts.xiaohongshu,
      ]);
      mockPrismaService.account.count.mockResolvedValue(2);

      // Controller 签名: findAll(platform?, teamId?, skip?, take?, userId?)
      const result = await accountsController.findAll(
        undefined, // platform
        undefined, // teamId
        undefined, // skip
        undefined, // take
        'user-001', // userId
      );

      expect(result.accounts).toHaveLength(2);
      expect(result.total).toBe(2);
    });
  });

  // ==================== 查询单个账号 API 测试 ====================

  describe('GET /accounts/:id', () => {
    it('应返回账号详情', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        posts: [],
        _count: { posts: 0 },
      });

      const result = await accountsController.findOne('acc-001');

      expect(result).toHaveProperty('id', 'acc-001');
    });

    it('账号不存在时应返回 404 错误', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null);

      await expect(accountsController.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== 更新账号 API 测试 ====================

  describe('PUT /accounts/:id', () => {
    it('应成功更新账号信息', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccounts.douyin,
        nickname: '更新后的昵称',
      });

      // Controller 签名: update(id, dto, userId)
      const result = await accountsController.update(
        'acc-001',
        { nickname: '更新后的昵称' },
        'user-001',
      );

      expect(result.nickname).toBe('更新后的昵称');
    });

    it('无权限更新时应返回 403 错误', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      await expect(
        accountsController.update(
          'acc-001',
          { nickname: '尝试更新' },
          'user-other',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== 删除账号 API 测试 ====================

  describe('DELETE /accounts/:id', () => {
    it('应成功删除账号', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.account.delete.mockResolvedValue(mockAccounts.douyin);

      // Controller 签名: remove(id, userId)
      const result = await accountsController.remove('acc-001', 'user-001');

      expect(result).toEqual({ success: true });
    });

    it('无权限删除时应返回 403 错误', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin);
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);

      await expect(
        accountsController.remove('acc-001', 'user-other'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== Cookie 操作 API 测试 ====================

  describe('Cookie 操作', () => {
    it('应能获取解密后的 Cookie', async () => {
      const crypto = require('crypto');
      const iv = crypto.randomBytes(16);
      const key = crypto.scryptSync(
        process.env.COOKIE_ENCRYPTION_KEY || 'test-cookie-encryption-key-32bytes!',
        'salt',
        32,
      );
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update('raw_cookie', 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const encryptedCookie = iv.toString('hex') + ':' + encrypted;

      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        cookies: encryptedCookie,
      });

      // Controller 签名: getCookies(id, userId)
      const result = await accountsController.getCookies('acc-001', 'user-001');

      expect(result.cookies).toBe('raw_cookie');
    });
  });

  // ==================== 完整 CRUD 生命周期测试 ====================

  describe('完整 CRUD 生命周期', () => {
    it('应支持 创建 -> 查询 -> 更新 -> 删除 的完整流程', async () => {
      // 1. 创建
      mockPrismaService.account.findUnique.mockResolvedValue(null);
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
      });

      const created = await accountsService.create(
        {
          platform: Platform.DOUYIN,
          platformUserId: 'dy_lifecycle',
          nickname: '生命周期测试',
        },
        'user-001',
      );
      expect(created.id).toBe('acc-lifecycle');

      // 2. 查询
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
        posts: [],
        _count: { posts: 0 },
      });

      const found = await accountsService.findById('acc-lifecycle');
      expect(found.id).toBe('acc-lifecycle');

      // 3. 更新
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
      });
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
        nickname: '更新后的名称',
      });

      const updated = await accountsService.update(
        'acc-lifecycle',
        { nickname: '更新后的名称' },
        'user-001',
      );
      expect(updated.nickname).toBe('更新后的名称');

      // 4. 删除
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
      });
      mockPrismaService.account.delete.mockResolvedValue({});

      const deleted = await accountsService.remove('acc-lifecycle', 'user-001');
      expect(deleted.success).toBe(true);
    });
  });
});
