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
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
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

  it('stores follower period metrics without overwriting video period metrics', async () => {
    const { service, prisma } = makeService()
    prisma.account.findUnique.mockResolvedValue({
      id: 'acc-1',
      platform: 'WECHAT_VIDEO',
      followers: 100,
      metadata: JSON.stringify({
        periodMetrics: {
          videoData: {
            day_total: { play: 10, like: 1, comment: 1, share: 1, new_fans: 1 },
          },
        },
      }),
    })
    prisma.dailyStats.findFirst.mockResolvedValue(null)

    await service.reportMetrics({
      accountId: 'acc-1',
      date: '2026-07-08',
      metrics: {
        _periodMetrics: {
          followerData: {
            day_total: { new_fans: 3, unfollows: 1, net_fans: 2 },
            week_total: { new_fans: 9, unfollows: 2, net_fans: 7 },
            source: 'channels_data_center_follower_data',
          },
        },
      },
    })

    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.any(String),
        }),
      }),
    )
    // reportMetrics 会先写一条 lastCollectAttemptAt 更新，再写业务更新；
    // 取第一条带 metadata 的更新。
    const updateArg = prisma.account.update.mock.calls
      .map((call: any[]) => call[0])
      .find((arg: any) => arg?.data?.metadata)
    const metadata = JSON.parse(updateArg.data.metadata)
    expect(metadata.periodMetrics.videoData.day_total.play).toBe(10)
    expect(metadata.periodMetrics.followerData.day_total.net_fans).toBe(2)
    expect(metadata.periodMetrics.followerData.week_total.net_fans).toBe(7)
  })
})
