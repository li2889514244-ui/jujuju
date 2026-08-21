import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { OAuthService } from '../../src/modules/platforms/oauth/oauth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { createMockConfigService } from '../helpers/test-helpers';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockRedisService, resetRedisMocks } from '../mocks/redis.mock';

describe('OAuthService', () => {
  let service: OAuthService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    resetPrismaMocks();
    resetRedisMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: ConfigService,
          useValue: createMockConfigService({
            TOKEN_ENCRYPTION_KEY: 'test-token-encryption-key-32-bytes!!',
          }),
        },
      ],
    }).compile();

    service = module.get<OAuthService>(OAuthService);
    prisma = mockPrismaService;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('refreshAccountToken', () => {
    it('returns false for malformed account metadata without touching the platform client', async () => {
      prisma.account.findUnique.mockResolvedValue({
        id: 'account-1',
        platform: 'DOUYIN',
        nickname: 'broken metadata account',
        metadata: '{not-json',
      });
      const getClientSpy = jest.spyOn(service, 'getClient');

      await expect(service.refreshAccountToken('account-1')).resolves.toBe(false);

      expect(getClientSpy).not.toHaveBeenCalled();
      expect(prisma.account.update).not.toHaveBeenCalled();
    });
  });
});
