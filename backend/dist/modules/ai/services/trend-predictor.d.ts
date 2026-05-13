import { type TrendResult } from '../utils/data-analyzer';
import type { PredictTrendDto } from '../dto/ai-request.dto';
export interface TrendPrediction {
    metric: string;
    currentValue: number;
    predictedValue: number;
    growthRate: number;
    trend: TrendResult;
    insights: string[];
    recommendations: string[];
}
export declare class TrendPredictorService {
    private readonly logger;
    predictTrend(dto: PredictTrendDto): Promise<TrendPrediction>;
    getMetricSummary(data: number[]): Promise<{
        mean: number;
        median: number;
        stdDev: number;
        trend: TrendResult;
        movingAvg: number[];
    }>;
    private generateMockData;
    private getStatisticalInsights;
    private getStatisticalRecommendations;
    private parseAIResponse;
}
