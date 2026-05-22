import { Module } from '@nestjs/common';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';
import { ContentGeneratorService } from './services/content-generator';
import { PublishOptimizerService } from './services/publish-optimizer';
import { TrendPredictorService } from './services/trend-predictor';
import { AnomalyDetectorService } from './services/anomaly-detector';
import { ContentReviewerService } from './services/content-reviewer';

@Module({
  controllers: [AIController],
  providers: [
    AIService,
    ContentGeneratorService,
    PublishOptimizerService,
    TrendPredictorService,
    AnomalyDetectorService,
    ContentReviewerService,
  ],
  exports: [AIService],
})
export class AIModule {}
