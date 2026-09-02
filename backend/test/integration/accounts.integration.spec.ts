import { Test, TestingModule } from '@nestjs/testing'
import { NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { AccountsService } from '../../src/modules/accounts/accounts.service'
import { AccountsController } from '../../src/modules/accounts/accounts.controller'
import { PrismaService } from '../../src/prisma/prisma.service'
import { CookieManager } from '../../src/modules/uploader/cookie-manager'
import { PermissionService } from '../../src/modules/teams/permission.service'
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock'
import { mockAccounts } from '../fixtures'
import { Platform } from '../../src/common/prisma-enums'

describe('Accounts integration', () => {
  let accountsService: AccountsService
  let accountsController: AccountsController

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountsController],
      providers: [
        AccountsService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: CookieManager,
          useValue: { saveCookies: jest.fn(), loadCookies: jest.fn() },
        },
        {
          provide: PermissionService,
          useValue: { assertUserPermission: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile()

    accountsService = module.get<AccountsService>(AccountsService)
    accountsController = module.get<AccountsController>(AccountsController)
  })

  beforeEach(() => {
    resetPrismaMocks()
    mockPrismaService.account.upsert.mockImplementation(async (args: any) => {
      const created = await mockPrismaService.account.create({
        data: args.create,
        include: args.include,
      })
      return created ?? { id: 'acc-mock', ...args.create }
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('POST /accounts', () => {
    it('creates an account through the controller', async () => {
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-new',
      })

      const result = await accountsController.create(
        {
          platform: Platform.DOUYIN,
          platformUserId: 'dy_new',
          nickname: 'New Douyin Account',
          cookies: 'test_cookie',
        },
        'user-001',
      )

      expect(result).toHaveProperty('id')
      expect(result).toHaveProperty('hasCookies', true)
      expect(mockPrismaService.account.upsert).toHaveBeenCalled()
    })

    it('updates an existing platform account through upsert', async () => {
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        nickname: 'Updated Existing Account',
      })

      const result = await accountsController.create(
        {
          platform: Platform.DOUYIN,
          platformUserId: 'dy_user_001',
          nickname: 'Updated Existing Account',
        },
        'user-001',
      )

      expect(result.nickname).toBe('Updated Existing Account')
      expect(mockPrismaService.account.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            platform_platformUserId: {
              platform: Platform.DOUYIN,
              platformUserId: 'dy_user_001',
            },
          },
        }),
      )
    })
  })

  describe('GET /accounts', () => {
    it('returns a paged account list', async () => {
      mockPrismaService.account.findMany.mockResolvedValue([
        mockAccounts.douyin,
        mockAccounts.xiaohongshu,
      ])
      mockPrismaService.account.count.mockResolvedValue(2)

      const result = await accountsController.findAll(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'user-001',
      )

      expect(result.accounts).toHaveLength(2)
      expect(result.total).toBe(2)
    })
  })

  describe('GET /accounts/:id', () => {
    it('returns account details', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        posts: [],
        _count: { posts: 0 },
      })

      const result = await accountsController.findOne('acc-001', 'user-001')

      expect(result).toHaveProperty('id', 'acc-001')
    })

    it('throws 404 when the account does not exist', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(null)

      await expect(accountsController.findOne('nonexistent', 'user-001')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('PUT /accounts/:id', () => {
    it('updates account information', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin)
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccounts.douyin,
        nickname: 'Updated Name',
      })

      const result = await accountsController.update(
        'acc-001',
        { nickname: 'Updated Name' },
        'user-001',
      )

      expect(result.nickname).toBe('Updated Name')
    })

    it('allows shared-mode account updates by another user', async () => {
      // 共享模式：请求用户与账号主人在同一组织，应放行
      mockPrismaService.user.findUnique.mockImplementation(async (args: any) => {
        const id = args?.where?.id
        if (id === 'user-other') return { role: 'MEMBER', organizationId: 'org-1' }
        return { organizationId: 'org-1' }
      })
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin)
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccounts.douyin,
        nickname: 'Shared Mode Update',
      })

      const result = await accountsController.update(
        'acc-001',
        { nickname: 'Shared Mode Update' },
        'user-other',
      )

      expect(result.nickname).toBe('Shared Mode Update')
    })
  })

  describe('DELETE /accounts/:id', () => {
    it('deletes an account', async () => {
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin)
      mockPrismaService.account.delete.mockResolvedValue(mockAccounts.douyin)

      const result = await accountsController.remove('acc-001', 'user-001')

      expect(result).toEqual({ success: true })
    })

    it('allows shared-mode account deletes by another user', async () => {
      // 共享模式：请求用户与账号主人在同一组织，应放行
      mockPrismaService.user.findUnique.mockImplementation(async (args: any) => {
        const id = args?.where?.id
        if (id === 'user-other') return { role: 'MEMBER', organizationId: 'org-1' }
        return { organizationId: 'org-1' }
      })
      mockPrismaService.account.findUnique.mockResolvedValue(mockAccounts.douyin)
      mockPrismaService.account.delete.mockResolvedValue(mockAccounts.douyin)

      const result = await accountsController.remove('acc-001', 'user-other')

      expect(result).toEqual({ success: true })
    })
  })

  describe('cookie operations', () => {
    it('returns decrypted legacy CBC cookies', async () => {
      const iv = crypto.randomBytes(16)
      const key = crypto.scryptSync(
        process.env.COOKIE_ENCRYPTION_KEY || 'test-cookie-encryption-key-32bytes!',
        'salt',
        32,
      )
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
      let encrypted = cipher.update('raw_cookie', 'utf8', 'hex')
      encrypted += cipher.final('hex')
      const encryptedCookie = `${iv.toString('hex')}:${encrypted}`

      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        cookies: encryptedCookie,
      })

      const result = await accountsController.getCookies('acc-001', 'user-001')

      expect(result.cookies).toBe('raw_cookie')
    })
  })

  describe('full CRUD lifecycle', () => {
    it('supports create, read, update, and delete', async () => {
      mockPrismaService.account.create.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
      })

      const created = await accountsService.create(
        {
          platform: Platform.DOUYIN,
          platformUserId: 'dy_lifecycle',
          nickname: 'Lifecycle Account',
        },
        'user-001',
      )
      expect(created.id).toBe('acc-lifecycle')

      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
        posts: [],
        _count: { posts: 0 },
      })

      const found = await accountsService.findById('acc-lifecycle')
      expect(found.id).toBe('acc-lifecycle')

      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
      })
      mockPrismaService.account.update.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
        nickname: 'Updated Lifecycle Account',
      })

      const updated = await accountsService.update(
        'acc-lifecycle',
        { nickname: 'Updated Lifecycle Account' },
        'user-001',
      )
      expect(updated.nickname).toBe('Updated Lifecycle Account')

      mockPrismaService.account.findUnique.mockResolvedValue({
        ...mockAccounts.douyin,
        id: 'acc-lifecycle',
      })
      mockPrismaService.account.delete.mockResolvedValue({})

      const deleted = await accountsService.remove('acc-lifecycle', 'user-001')
      expect(deleted.success).toBe(true)
    })
  })
})
