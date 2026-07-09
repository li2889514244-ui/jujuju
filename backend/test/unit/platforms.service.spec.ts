import { PlatformsService } from '../../src/modules/platforms/platforms.service'

describe('PlatformsService reportMetrics', () => {
  const makeService = () => {
    const prisma: any = {
      account: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      dailyStats: {
        findFirst: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
    }
    const collector = {}
    const service = new PlatformsService(
      prisma,
      {} as any,
      collector as any,
      collector as any,
      collector as any,
      collector as any,
      collector as any,
      collector as any,
    )
    return { service, prisma }
  }

  beforeEach(() => {
    jest.restoreAllMocks()
  })

  it('fills a missing increment field even when another increment was reported', async () => {
    const { service, prisma } = makeService()
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      platform: 'DOUYIN',
      metadata: null,
    })
    prisma.dailyStats.findFirst.mockResolvedValue({
      followers: 1000,
      views: 9000,
      likes: 500,
      comments: 20,
      shares: 10,
    })

    await service.reportMetrics({
      accountId: 'acc-1',
      date: '2026-07-08',
      metrics: {
        followers: 1005,
        views: 9500,
        likes: 560,
        newLikes: 60,
      },
    })

    expect(prisma.dailyStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          followersIncrement: 5,
          viewsIncrement: 500,
          likesIncrement: 60,
        }),
      }),
    )
  })

  it('treats a zero reported increment as missing when the total increased and baseline is trusted', async () => {
    const { service, prisma } = makeService()
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      platform: 'DOUYIN',
      metadata: null,
    })
    prisma.dailyStats.findFirst.mockResolvedValue({
      followers: 1000,
      views: 9000,
      likes: 500,
      comments: 20,
      shares: 10,
    })

    await service.reportMetrics({
      accountId: 'acc-1',
      date: '2026-07-08',
      metrics: {
        views: 9500,
        newViews: 0,
      },
    })

    expect(prisma.dailyStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          viewsIncrement: 500,
        }),
      }),
    )
  })

  it('does not fill an increment when the previous total has a likely source jump', async () => {
    const { service, prisma } = makeService()
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      platform: 'DOUYIN',
      metadata: null,
    })
    prisma.dailyStats.findFirst.mockResolvedValue({
      followers: 1000,
      views: 490700,
      likes: 500,
      comments: 0,
      shares: 0,
    })

    await service.reportMetrics({
      accountId: 'acc-1',
      date: '2026-07-08',
      metrics: {
        views: 12112727,
        newViews: 0,
      },
    })

    expect(prisma.dailyStats.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          viewsIncrement: 0,
        }),
      }),
    )
  })
})
