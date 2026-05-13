"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIModule = void 0;
const common_1 = require("@nestjs/common");
const ai_controller_1 = require("./ai.controller");
const ai_service_1 = require("./ai.service");
const content_generator_1 = require("./services/content-generator");
const publish_optimizer_1 = require("./services/publish-optimizer");
const trend_predictor_1 = require("./services/trend-predictor");
const anomaly_detector_1 = require("./services/anomaly-detector");
const content_reviewer_1 = require("./services/content-reviewer");
let AIModule = class AIModule {
};
exports.AIModule = AIModule;
exports.AIModule = AIModule = __decorate([
    (0, common_1.Module)({
        controllers: [ai_controller_1.AIController],
        providers: [
            ai_service_1.AIService,
            content_generator_1.ContentGeneratorService,
            publish_optimizer_1.PublishOptimizerService,
            trend_predictor_1.TrendPredictorService,
            anomaly_detector_1.AnomalyDetectorService,
            content_reviewer_1.ContentReviewerService,
        ],
        exports: [ai_service_1.AIService],
    })
], AIModule);
//# sourceMappingURL=ai.module.js.map