import { AIService } from './ai.service';
import { GenerateContentDto, OptimizePublishDto, PredictTrendDto, DetectAnomalyDto, ReviewContentDto } from './dto/ai-request.dto';
export declare class AIController {
    private readonly aiService;
    constructor(aiService: AIService);
    generateContent(dto: GenerateContentDto): Promise<import("./services/content-generator").ContentResult>;
    generateBatch(items: GenerateContentDto[]): Promise<import("./services/content-generator").ContentResult[]>;
    generateTitles(body: {
        topic: string;
        platform?: string;
        count?: number;
    }): Promise<string[]>;
    generateTags(body: {
        topic: string;
        platform?: string;
    }): Promise<string[]>;
    getBestPublishTime(dto: OptimizePublishDto): Promise<import("./services/publish-optimizer").PublishTimeRecommendation>;
    getPublishFrequency(dto: OptimizePublishDto): Promise<{
        frequency: string;
        tips: string[];
    }>;
    predictTrend(dto: PredictTrendDto): Promise<import("./services/trend-predictor").TrendPrediction>;
    detectAnomaly(dto: DetectAnomalyDto): Promise<import("./services/anomaly-detector").AnomalyReport>;
    detectAccountRisk(body: {
        followers: number[];
        engagement: number[];
        publishFrequency: number[];
    }): Promise<{
        riskScore: number;
        issues: string[];
        recommendations: string[];
    }>;
    reviewContent(dto: ReviewContentDto): Promise<import("./services/content-reviewer").ReviewResult>;
    getProviders(): Promise<string[]>;
    getCapabilities(): Promise<Record<string, string[]>>;
}
