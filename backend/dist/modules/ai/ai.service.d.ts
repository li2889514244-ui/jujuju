import { ContentGeneratorService, type ContentResult } from './services/content-generator';
import { PublishOptimizerService, type PublishTimeRecommendation } from './services/publish-optimizer';
import { TrendPredictorService, type TrendPrediction } from './services/trend-predictor';
import { AnomalyDetectorService, type AnomalyReport } from './services/anomaly-detector';
import { ContentReviewerService, type ReviewResult } from './services/content-reviewer';
import type { GenerateContentDto, OptimizePublishDto, PredictTrendDto, DetectAnomalyDto, ReviewContentDto } from './dto/ai-request.dto';
export declare class AIService {
    private readonly contentGenerator;
    private readonly publishOptimizer;
    private readonly trendPredictor;
    private readonly anomalyDetector;
    private readonly contentReviewer;
    private readonly logger;
    constructor(contentGenerator: ContentGeneratorService, publishOptimizer: PublishOptimizerService, trendPredictor: TrendPredictorService, anomalyDetector: AnomalyDetectorService, contentReviewer: ContentReviewerService);
    generateContent(dto: GenerateContentDto): Promise<ContentResult>;
    generateBatchContent(items: GenerateContentDto[]): Promise<ContentResult[]>;
    generateTitles(topic: string, platform?: string, count?: number): Promise<string[]>;
    generateTags(topic: string, platform?: string): Promise<string[]>;
    getBestPublishTime(dto: OptimizePublishDto): Promise<PublishTimeRecommendation>;
    getPublishFrequency(dto: OptimizePublishDto): Promise<{
        frequency: string;
        tips: string[];
    }>;
    predictTrend(dto: PredictTrendDto): Promise<TrendPrediction>;
    detectAnomaly(dto: DetectAnomalyDto): Promise<AnomalyReport>;
    detectAccountRisk(accountData: {
        followers: number[];
        engagement: number[];
        publishFrequency: number[];
    }): Promise<{
        riskScore: number;
        issues: string[];
        recommendations: string[];
    }>;
    reviewContent(dto: ReviewContentDto): Promise<ReviewResult>;
    getProviders(): string[];
    getCapabilities(): Record<string, string[]>;
}
