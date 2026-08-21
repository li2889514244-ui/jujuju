import { AnomalyDetectorService } from '../../src/modules/ai/services/anomaly-detector'
import { TrendPredictorService } from '../../src/modules/ai/services/trend-predictor'
import { toFiniteNumberSeries } from '../../src/modules/ai/utils/data-analyzer'

describe('AI numeric input stability', () => {
  it('keeps only finite numeric series values', () => {
    expect(toFiniteNumberSeries([1, '2', '', null, undefined, 'bad', Infinity, 3])).toEqual([
      1, 2, 3,
    ])
    expect(toFiniteNumberSeries({ values: [1, 2, 3] })).toEqual([])
  })

  it('returns an empty anomaly report for non-array dataset JSON', async () => {
    const service = new AnomalyDetectorService()

    await expect(
      service.detect({
        dataset: JSON.stringify({ values: [1, 2, 3] }),
        metric: 'views',
        sensitivity: 'medium',
      }),
    ).resolves.toMatchObject({
      anomalies: [],
      riskLevel: 'low',
      statistics: {
        dataPoints: 0,
        mean: 0,
        stdDev: 0,
      },
    })
  })

  it('falls back cleanly when trend historicalData is valid JSON but not an array', async () => {
    const prisma = {
      dailyStats: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    }
    const service = new TrendPredictorService(prisma as any)

    const result = await service.predictTrend({
      metric: 'views',
      days: 7,
      historicalData: JSON.stringify({ values: [1, 2, 3] }),
    })

    expect(prisma.dailyStats.findMany).toHaveBeenCalled()
    expect(result).toMatchObject({
      currentValue: 0,
      predictedValue: 0,
      growthRate: 0,
      dataSource: 'none',
    })
    expect(Number.isFinite(result.growthRate)).toBe(true)
  })
})
