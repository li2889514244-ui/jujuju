import { Injectable, Logger } from '@nestjs/common';
import { getProvider } from '../providers/ai-provider.interface';
import { renderTemplate } from '../utils/prompt-templates';
import { calculateTrend, growthRate, compoundGrowthRate, movingAverage, type TrendResult } from '../utils/data-analyzer';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PredictTrendDto } from '../dto/ai-request.dto';

export interface TrendPrediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  growthRate: number;
  trend: TrendResult;
  insights: string[];
  recommendations: string[];
  dataSource: 'real' | 'mock' | 'none';
}

@Injectable()
export class TrendPredictorService {
  private readonly logger = new Logger(TrendPredictorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async predictTrend(dto: PredictTrendDto): Promise<TrendPrediction> {
    const provider = getProvider();
    const days = dto.days || 30;

    // Try to get real data from DailyStats
    let historicalValues: number[] = [];
    let dataSource: 'real' | 'mock' | 'none' = 'none';

    if (dto.historicalData) {
      try {
        historicalValues = JSON.parse(dto.historicalData);
        dataSource = 'real';
      } catch {
        this.logger.warn('Invalid historical data JSON');
      }
    }

    // If no explicit data, query database for real metrics
    if (historicalValues.length === 0) {
      historicalValues = await this.fetchRealMetrics(dto.metric, dto.platform, days + 30);
      if (historicalValues.length > 0) {
        dataSource = 'real';
      }
    }

    // If still no data, return empty prediction
    if (historicalValues.length === 0) {
      this.logger.warn(`No real data available for trend prediction: metric=${dto.metric}`);
      return {
        metric: dto.metric,
        currentValue: 0,
        predictedValue: 0,
        growthRate: 0,
        trend: { direction: 'stable', slope: 0, r2: 0, predicted: [], forecast: [] },
        insights: ['暂无足够的历史数据进行趋势预测，请先通过桌面伴侣采集数据。'],
        recommendations: ['绑定账号并使用桌面伴侣采集数据后再查看趋势预测。'],
        dataSource: 'none',
      };
    }

    // Statistical analysis
    const trend = calculateTrend(historicalValues, days);
    const currentValue = historicalValues[historicalValues.length - 1] || 0;
    const predictedValue = trend.forecast[trend.forecast.length - 1] || currentValue;
    const cgr = compoundGrowthRate(historicalValues);
    const ma = movingAverage(historicalValues, 7);

    // AI-powered insights (falls back to statistical if AI unavailable)
    let insights: string[] = [];
    let recommendations: string[] = [];

    try {
      const prompt = renderTemplate(
        dto.metric === 'followers' ? 'follower_growth' : 'content_trend',
        {
          platform: dto.platform || '全平台',
          currentFollowers: currentValue,
          historicalData: JSON.stringify(historicalValues.slice(-30)),
          days,
          topic: dto.metric,
          audience: '年轻用户',
        },
      );

      const response = await provider.complete({
        prompt,
        systemPrompt: '你是一位数据分析师，擅长趋势预测和增长策略。',
        temperature: 0.6,
        maxTokens: 1500,
      });

      const parsed = this.parseAIResponse(response.content);
      insights = parsed.insights;
      recommendations = parsed.recommendations;
    } catch (error) {
      this.logger.warn('AI trend analysis failed, using statistical insights');
      insights = this.getStatisticalInsights(trend, cgr, dto.metric);
      recommendations = this.getStatisticalRecommendations(trend, dto.metric);
    }

    return {
      metric: dto.metric,
      currentValue,
      predictedValue: Math.max(0, Math.round(predictedValue)),
      growthRate: cgr,
      trend,
      insights,
      recommendations,
      dataSource,
    };
  }

  /**
   * Query real DailyStats from database for the given metric
   */
  private async fetchRealMetrics(metric: string, platform: string | undefined, days: number): Promise<number[]> {
    try {
      const metricField = this.getMetricField(metric);
      if (!metricField) return [];

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const where: any = {
        date: { gte: startDate },
      };
      if (platform) where.platform = platform;

      const stats = await this.prisma.dailyStats.findMany({
        where,
        select: {
          date: true,
          [metricField]: true,
        } as any,
        orderBy: { date: 'asc' },
      });

      if (stats.length === 0) return [];

      // Aggregate by date (sum across all accounts for each day)
      const byDate = new Map<string, number>();
      for (const s of stats) {
        const dateKey = new Date(s.date as any).toISOString().split('T')[0];
        const val = (s as any)[metricField] || 0;
        byDate.set(dateKey, (byDate.get(dateKey) || 0) + val);
      }

      return Array.from(byDate.values());
    } catch (error) {
      this.logger.error(`Failed to fetch real metrics: ${error}`);
      return [];
    }
  }

  private getMetricField(metric: string): string | null {
    const map: Record<string, string> = {
      followers: 'followers',
      likes: 'likes',
      views: 'views',
      engagement: 'likes', // engagement = likes / followers, approximate with likes
    };
    return map[metric] || null;
  }

  async getMetricSummary(data: number[]): Promise<{
    mean: number;
    median: number;
    stdDev: number;
    trend: TrendResult;
    movingAvg: number[];
  }> {
    const { mean, median, standardDeviation } = await import('../utils/data-analyzer');
    return {
      mean: mean(data),
      median: median(data),
      stdDev: standardDeviation(data),
      trend: calculateTrend(data),
      movingAvg: movingAverage(data),
    };
  }

  private getStatisticalInsights(trend: TrendResult, cgr: number, metric: string): string[] {
    const insights: string[] = [];
    const metricLabel = { followers: '粉丝', likes: '点赞', views: '播放量', engagement: '互动率' }[metric] || metric;

    if (trend.direction === 'up') {
      insights.push(`${metricLabel}呈上升趋势，日均增长约${Math.abs(trend.slope).toFixed(1)}`);
    } else if (trend.direction === 'down') {
      insights.push(`⚠️ ${metricLabel}呈下降趋势，需关注并调整策略`);
    } else {
      insights.push(`${metricLabel}保持稳定，波动较小`);
    }

    if (trend.r2 > 0.8) {
      insights.push('趋势预测可信度高（R²>0.8）');
    } else if (trend.r2 > 0.5) {
      insights.push('趋势预测可信度中等，存在一定波动');
    } else {
      insights.push('数据波动较大，趋势预测仅供参考');
    }

    if (cgr > 0) {
      insights.push(`复合增长率: ${(cgr * 100).toFixed(2)}%/天`);
    }

    return insights;
  }

  private getStatisticalRecommendations(trend: TrendResult, metric: string): string[] {
    const recs: string[] = [];

    if (trend.direction === 'down') {
      recs.push('分析近期内容表现，找出下降原因');
      recs.push('尝试新的内容形式或话题');
      recs.push('增加与粉丝的互动频率');
    } else if (trend.direction === 'up') {
      recs.push('保持当前策略，持续输出优质内容');
      recs.push('趁增长势头加大发布频率');
      recs.push('分析爆款内容特征，复制成功经验');
    } else {
      recs.push('尝试突破当前瓶颈，寻找新增长点');
      recs.push('关注平台热点，及时跟进热门话题');
    }

    recs.push('定期复盘数据，及时调整策略');

    return recs;
  }

  private parseAIResponse(content: string): { insights: string[]; recommendations: string[] } {
    const insights: string[] = [];
    const recommendations: string[] = [];

    const lines = content.split('\n');
    let section = 'unknown';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('分析') || trimmed.includes('趋势') || trimmed.includes('洞察')) {
        section = 'insights';
        continue;
      }
      if (trimmed.includes('建议') || trimmed.includes('策略') || trimmed.includes('推荐')) {
        section = 'recommendations';
        continue;
      }

      const cleaned = trimmed.replace(/^[\d]+[\.\、\)]\s*|^[•\-\*]\s*/, '');
      if (cleaned.length > 5) {
        if (section === 'insights') insights.push(cleaned);
        else if (section === 'recommendations') recommendations.push(cleaned);
      }
    }

    return { insights, recommendations };
  }
}
