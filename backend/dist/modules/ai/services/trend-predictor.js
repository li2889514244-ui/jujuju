"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TrendPredictorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrendPredictorService = void 0;
const common_1 = require("@nestjs/common");
const ai_provider_interface_1 = require("../providers/ai-provider.interface");
const prompt_templates_1 = require("../utils/prompt-templates");
const data_analyzer_1 = require("../utils/data-analyzer");
let TrendPredictorService = TrendPredictorService_1 = class TrendPredictorService {
    constructor() {
        this.logger = new common_1.Logger(TrendPredictorService_1.name);
    }
    async predictTrend(dto) {
        const provider = (0, ai_provider_interface_1.getProvider)();
        const days = dto.days || 30;
        let historicalValues = [];
        if (dto.historicalData) {
            try {
                historicalValues = JSON.parse(dto.historicalData);
            }
            catch {
                this.logger.warn('Invalid historical data JSON, using mock');
            }
        }
        if (historicalValues.length === 0) {
            historicalValues = this.generateMockData(dto.metric, 60);
        }
        const trend = (0, data_analyzer_1.calculateTrend)(historicalValues, days);
        const currentValue = historicalValues[historicalValues.length - 1] || 0;
        const predictedValue = trend.forecast[trend.forecast.length - 1] || currentValue;
        const cgr = (0, data_analyzer_1.compoundGrowthRate)(historicalValues);
        const ma = (0, data_analyzer_1.movingAverage)(historicalValues, 7);
        let insights = [];
        let recommendations = [];
        try {
            const prompt = (0, prompt_templates_1.renderTemplate)(dto.metric === 'followers' ? 'follower_growth' : 'content_trend', {
                platform: dto.platform || '抖音',
                currentFollowers: currentValue,
                historicalData: JSON.stringify(historicalValues.slice(-30)),
                days,
                topic: dto.metric,
                audience: '年轻用户',
            });
            const response = await provider.complete({
                prompt,
                systemPrompt: '你是一位数据分析师，擅长趋势预测和增长策略。',
                temperature: 0.6,
                maxTokens: 1500,
            });
            const parsed = this.parseAIResponse(response.content);
            insights = parsed.insights;
            recommendations = parsed.recommendations;
        }
        catch (error) {
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
        };
    }
    async getMetricSummary(data) {
        const { mean, median, standardDeviation } = await Promise.resolve().then(() => require('../utils/data-analyzer'));
        return {
            mean: mean(data),
            median: median(data),
            stdDev: standardDeviation(data),
            trend: (0, data_analyzer_1.calculateTrend)(data),
            movingAvg: (0, data_analyzer_1.movingAverage)(data),
        };
    }
    generateMockData(metric, days) {
        const baseValues = {
            followers: { base: 10000, daily: 50, variance: 20 },
            likes: { base: 50000, daily: 200, variance: 80 },
            views: { base: 100000, daily: 1000, variance: 300 },
            engagement: { base: 5, daily: 0.05, variance: 0.5 },
        };
        const cfg = baseValues[metric] || baseValues.followers;
        const data = [];
        for (let i = 0; i < days; i++) {
            const trend = cfg.base + cfg.daily * i;
            const noise = (Math.random() - 0.5) * 2 * cfg.variance;
            data.push(Math.max(0, Math.round(trend + noise)));
        }
        return data;
    }
    getStatisticalInsights(trend, cgr, metric) {
        const insights = [];
        const metricLabel = { followers: '粉丝', likes: '点赞', views: '播放量', engagement: '互动率' }[metric] || metric;
        if (trend.direction === 'up') {
            insights.push(`${metricLabel}呈上升趋势，日均增长约${Math.abs(trend.slope).toFixed(1)}`);
        }
        else if (trend.direction === 'down') {
            insights.push(`⚠️ ${metricLabel}呈下降趋势，需关注并调整策略`);
        }
        else {
            insights.push(`${metricLabel}保持稳定，波动较小`);
        }
        if (trend.r2 > 0.8) {
            insights.push('趋势预测可信度高（R²>0.8）');
        }
        else if (trend.r2 > 0.5) {
            insights.push('趋势预测可信度中等，存在一定波动');
        }
        else {
            insights.push('数据波动较大，趋势预测仅供参考');
        }
        if (cgr > 0) {
            insights.push(`复合增长率: ${(cgr * 100).toFixed(2)}%/天`);
        }
        return insights;
    }
    getStatisticalRecommendations(trend, metric) {
        const recs = [];
        if (trend.direction === 'down') {
            recs.push('分析近期内容表现，找出下降原因');
            recs.push('尝试新的内容形式或话题');
            recs.push('增加与粉丝的互动频率');
        }
        else if (trend.direction === 'up') {
            recs.push('保持当前策略，持续输出优质内容');
            recs.push('趁增长势头加大发布频率');
            recs.push('分析爆款内容特征，复制成功经验');
        }
        else {
            recs.push('尝试突破当前瓶颈，寻找新增长点');
            recs.push('关注平台热点，及时跟进热门话题');
        }
        recs.push('定期复盘数据，及时调整策略');
        return recs;
    }
    parseAIResponse(content) {
        const insights = [];
        const recommendations = [];
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
                if (section === 'insights')
                    insights.push(cleaned);
                else if (section === 'recommendations')
                    recommendations.push(cleaned);
            }
        }
        return { insights, recommendations };
    }
};
exports.TrendPredictorService = TrendPredictorService;
exports.TrendPredictorService = TrendPredictorService = TrendPredictorService_1 = __decorate([
    (0, common_1.Injectable)()
], TrendPredictorService);
//# sourceMappingURL=trend-predictor.js.map