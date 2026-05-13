"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AIService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIService = void 0;
const common_1 = require("@nestjs/common");
const content_generator_1 = require("./services/content-generator");
const publish_optimizer_1 = require("./services/publish-optimizer");
const trend_predictor_1 = require("./services/trend-predictor");
const anomaly_detector_1 = require("./services/anomaly-detector");
const content_reviewer_1 = require("./services/content-reviewer");
const ai_provider_interface_1 = require("./providers/ai-provider.interface");
let AIService = AIService_1 = class AIService {
    constructor(contentGenerator, publishOptimizer, trendPredictor, anomalyDetector, contentReviewer) {
        this.contentGenerator = contentGenerator;
        this.publishOptimizer = publishOptimizer;
        this.trendPredictor = trendPredictor;
        this.anomalyDetector = anomalyDetector;
        this.contentReviewer = contentReviewer;
        this.logger = new common_1.Logger(AIService_1.name);
    }
    async generateContent(dto) {
        this.logger.log(`AI generateContent: type=${dto.type}, topic=${dto.topic}`);
        return this.contentGenerator.generate(dto);
    }
    async generateBatchContent(items) {
        this.logger.log(`AI generateBatchContent: ${items.length} items`);
        return this.contentGenerator.generateBatch(items);
    }
    async generateTitles(topic, platform, count) {
        return this.contentGenerator.generateTitle(topic, platform, count);
    }
    async generateTags(topic, platform) {
        return this.contentGenerator.generateTags(topic, platform);
    }
    async getBestPublishTime(dto) {
        this.logger.log(`AI getBestPublishTime: platform=${dto.platform}`);
        return this.publishOptimizer.getBestPublishTime(dto);
    }
    async getPublishFrequency(dto) {
        return this.publishOptimizer.getPublishFrequency(dto);
    }
    async predictTrend(dto) {
        this.logger.log(`AI predictTrend: metric=${dto.metric}, days=${dto.days}`);
        return this.trendPredictor.predictTrend(dto);
    }
    async detectAnomaly(dto) {
        this.logger.log(`AI detectAnomaly: metric=${dto.metric}, sensitivity=${dto.sensitivity}`);
        return this.anomalyDetector.detect(dto);
    }
    async detectAccountRisk(accountData) {
        return this.anomalyDetector.detectAccountRisk(accountData);
    }
    async reviewContent(dto) {
        this.logger.log(`AI reviewContent: strictness=${dto.strictness}`);
        return this.contentReviewer.review(dto);
    }
    getProviders() {
        return (0, ai_provider_interface_1.listProviders)();
    }
    getCapabilities() {
        return {
            content: ['video_script', 'title', 'tags', 'caption'],
            publish: ['best_time', 'frequency'],
            trend: ['followers', 'likes', 'views', 'engagement'],
            anomaly: ['data_anomaly', 'account_risk'],
            review: ['content_review', 'sensitive_words', 'sentiment'],
        };
    }
};
exports.AIService = AIService;
exports.AIService = AIService = AIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_generator_1.ContentGeneratorService,
        publish_optimizer_1.PublishOptimizerService,
        trend_predictor_1.TrendPredictorService,
        anomaly_detector_1.AnomalyDetectorService,
        content_reviewer_1.ContentReviewerService])
], AIService);
//# sourceMappingURL=ai.service.js.map