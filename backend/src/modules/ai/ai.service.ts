import { Injectable, Logger } from '@nestjs/common';
import { ContentGeneratorService, type ContentResult } from './services/content-generator';
import { PublishOptimizerService, type PublishTimeRecommendation } from './services/publish-optimizer';
import { TrendPredictorService, type TrendPrediction } from './services/trend-predictor';
import { AnomalyDetectorService, type AnomalyReport } from './services/anomaly-detector';
import { ContentReviewerService, type ReviewResult } from './services/content-reviewer';
import { listProviders } from './providers/ai-provider.interface';
import type {
  GenerateContentDto,
  OptimizePublishDto,
  PredictTrendDto,
  DetectAnomalyDto,
  ReviewContentDto,
} from './dto/ai-request.dto';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly contentGenerator: ContentGeneratorService,
    private readonly publishOptimizer: PublishOptimizerService,
    private readonly trendPredictor: TrendPredictorService,
    private readonly anomalyDetector: AnomalyDetectorService,
    private readonly contentReviewer: ContentReviewerService,
  ) {}

  // ===== Content Generation =====

  async generateContent(dto: GenerateContentDto): Promise<ContentResult> {
    this.logger.log(`AI generateContent: type=${dto.type}, topic=${dto.topic}`);
    return this.contentGenerator.generate(dto);
  }

  async generateBatchContent(items: GenerateContentDto[]): Promise<ContentResult[]> {
    this.logger.log(`AI generateBatchContent: ${items.length} items`);
    return this.contentGenerator.generateBatch(items);
  }

  async generateTitles(topic: string, platform?: string, count?: number): Promise<string[]> {
    return this.contentGenerator.generateTitle(topic, platform, count);
  }

  async generateTags(topic: string, platform?: string): Promise<string[]> {
    return this.contentGenerator.generateTags(topic, platform);
  }

  // ===== Publish Optimization =====

  async getBestPublishTime(dto: OptimizePublishDto): Promise<PublishTimeRecommendation> {
    this.logger.log(`AI getBestPublishTime: platform=${dto.platform}`);
    return this.publishOptimizer.getBestPublishTime(dto);
  }

  async getPublishFrequency(dto: OptimizePublishDto): Promise<{ frequency: string; tips: string[] }> {
    return this.publishOptimizer.getPublishFrequency(dto);
  }

  // ===== Trend Prediction =====

  async predictTrend(dto: PredictTrendDto): Promise<TrendPrediction> {
    this.logger.log(`AI predictTrend: metric=${dto.metric}, days=${dto.days}`);
    return this.trendPredictor.predictTrend(dto);
  }

  // ===== Anomaly Detection =====

  async detectAnomaly(dto: DetectAnomalyDto): Promise<AnomalyReport> {
    this.logger.log(`AI detectAnomaly: metric=${dto.metric}, sensitivity=${dto.sensitivity}`);
    return this.anomalyDetector.detect(dto);
  }

  async detectAccountRisk(accountData: {
    followers: number[];
    engagement: number[];
    publishFrequency: number[];
  }): Promise<{ riskScore: number; issues: string[]; recommendations: string[] }> {
    return this.anomalyDetector.detectAccountRisk(accountData);
  }

  // ===== Content Review =====

  async reviewContent(dto: ReviewContentDto): Promise<ReviewResult> {
    this.logger.log(`AI reviewContent: strictness=${dto.strictness}`);
    return this.contentReviewer.review(dto);
  }

  // ===== System =====

  getProviders(): string[] {
    return listProviders();
  }

  getCapabilities(): Record<string, string[]> {
    return {
      content: ['video_script', 'title', 'tags', 'caption'],
      publish: ['best_time', 'frequency'],
      trend: ['followers', 'likes', 'views', 'engagement'],
      anomaly: ['data_anomaly', 'account_risk'],
      review: ['content_review', 'sensitive_words', 'sentiment'],
    };
  }
}
