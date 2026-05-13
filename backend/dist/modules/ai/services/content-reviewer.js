"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ContentReviewerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentReviewerService = void 0;
const common_1 = require("@nestjs/common");
const ai_provider_interface_1 = require("../providers/ai-provider.interface");
const prompt_templates_1 = require("../utils/prompt-templates");
const text_processor_1 = require("../utils/text-processor");
const SENSITIVE_WORDS = {
    political: ['习近平', '六四', '天安门', '法轮功', '台独', '藏独', '疆独'],
    violence: ['自杀', '自残', '炸弹', '枪击', '砍人', '爆炸物'],
    illegal: ['赌博', '毒品', '色情', '代孕', '洗钱', '传销'],
    spam: ['免费领取', '日赚万元', '加微信', '扫码领', '点击链接'],
    platform: ['刷粉', '刷赞', '买粉', '互刷', '僵尸粉'],
};
let ContentReviewerService = ContentReviewerService_1 = class ContentReviewerService {
    constructor() {
        this.logger = new common_1.Logger(ContentReviewerService_1.name);
    }
    async review(dto) {
        const content = dto.content;
        const strictness = dto.strictness || 'normal';
        const issues = [];
        issues.push(...this.checkSensitiveWords(content, strictness));
        const sentiment = (0, text_processor_1.analyzeSentiment)(content);
        const stats = (0, text_processor_1.getTextStats)(content);
        let aiSuggestions = [];
        let aiSummary = '';
        try {
            const provider = (0, ai_provider_interface_1.getProvider)();
            const prompt = (0, prompt_templates_1.renderTemplate)('content_review', {
                content: content.slice(0, 2000),
                platform: dto.platform || '抖音',
                strictness,
            });
            const response = await provider.complete({
                prompt,
                systemPrompt: '你是一位专业的内容审核员，精通各大平台的社区规范。',
                temperature: 0.3,
                maxTokens: 1000,
            });
            const parsed = this.parseAIResponse(response.content);
            aiSuggestions = parsed.suggestions;
            aiSummary = parsed.summary;
            issues.push(...parsed.issues);
        }
        catch (error) {
            this.logger.warn('AI content review failed, using rule-based review');
        }
        if (dto.platform) {
            issues.push(...this.platformSpecificCheck(content, dto.platform, strictness));
        }
        const riskScore = this.calculateRiskScore(issues, sentiment, strictness);
        const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 30 ? 'medium' : 'low';
        const passed = riskLevel !== 'high';
        const suggestions = [
            ...aiSuggestions,
            ...this.generateSuggestions(issues, sentiment),
        ];
        return {
            passed,
            riskLevel,
            score: riskScore,
            issues,
            sentiment,
            suggestions: [...new Set(suggestions)],
            summary: aiSummary || this.generateSummary(passed, riskLevel, issues.length),
        };
    }
    checkSensitiveWords(content, strictness) {
        const issues = [];
        const lower = content.toLowerCase();
        const threshold = strictness === 'strict' ? 'low' : strictness === 'lenient' ? 'high' : 'medium';
        for (const [category, words] of Object.entries(SENSITIVE_WORDS)) {
            for (const word of words) {
                const index = lower.indexOf(word.toLowerCase());
                if (index !== -1) {
                    const severity = category === 'political' || category === 'illegal' ? 'high' :
                        category === 'violence' ? 'high' :
                            category === 'spam' || category === 'platform' ? 'medium' : 'low';
                    if (strictness === 'lenient' && severity === 'low')
                        continue;
                    issues.push({
                        type: category,
                        severity,
                        message: `检测到${this.getCategoryLabel(category)}敏感词: "${word}"`,
                        word,
                        position: index,
                    });
                }
            }
        }
        return issues;
    }
    platformSpecificCheck(content, platform, strictness) {
        const issues = [];
        const limits = {
            douyin: 1000,
            kuaishou: 800,
            xiaohongshu: 1000,
            bilibili: 2000,
            weibo: 2000,
            video_account: 1000,
        };
        const limit = limits[platform];
        if (limit && content.length > limit) {
            issues.push({
                type: 'platform_violation',
                severity: 'medium',
                message: `内容长度(${content.length}字)超过${platform}平台限制(${limit}字)`,
            });
        }
        if (content.match(/https?:\/\/[^\s]+/g)) {
            issues.push({
                type: 'platform_violation',
                severity: 'medium',
                message: `${platform}平台可能限制外部链接展示`,
            });
        }
        return issues;
    }
    calculateRiskScore(issues, sentiment, strictness) {
        let score = 0;
        for (const issue of issues) {
            switch (issue.severity) {
                case 'high':
                    score += 30;
                    break;
                case 'medium':
                    score += 15;
                    break;
                case 'low':
                    score += 5;
                    break;
            }
        }
        if (sentiment.label === 'negative' && sentiment.confidence > 0.6) {
            score += 10;
        }
        const modifier = strictness === 'strict' ? 1.3 : strictness === 'lenient' ? 0.7 : 1.0;
        score = Math.round(score * modifier);
        return Math.min(100, Math.max(0, score));
    }
    generateSuggestions(issues, sentiment) {
        const suggestions = [];
        if (issues.some((i) => i.type === 'sensitive_word' || i.type === 'political')) {
            suggestions.push('请移除或替换敏感词汇，避免内容被限流或删除');
        }
        if (issues.some((i) => i.type === 'spam')) {
            suggestions.push('减少营销性质的表述，使用更自然的语言');
        }
        if (issues.some((i) => i.type === 'platform_violation')) {
            suggestions.push('请根据平台规范调整内容格式和长度');
        }
        if (sentiment.label === 'negative' && sentiment.confidence > 0.5) {
            suggestions.push('内容情绪偏负面，建议调整为更积极正面的表达');
        }
        return suggestions;
    }
    generateSummary(passed, riskLevel, issueCount) {
        if (passed && issueCount === 0) {
            return '✅ 内容审核通过，未发现明显问题。';
        }
        if (passed) {
            return `⚠️ 内容审核通过，但存在${issueCount}个潜在风险点，建议优化后发布。`;
        }
        return `❌ 内容审核未通过，存在${issueCount}个高风险问题，请修改后重新提交。`;
    }
    getCategoryLabel(category) {
        const labels = {
            political: '政治',
            violence: '暴力',
            illegal: '违法',
            spam: '营销',
            platform: '平台违规',
        };
        return labels[category] || '敏感';
    }
    parseAIResponse(content) {
        const issues = [];
        const suggestions = [];
        let summary = '';
        const lines = content.split('\n');
        let section = 'summary';
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.includes('违规') || trimmed.includes('敏感') || trimmed.includes('风险')) {
                section = 'issues';
                continue;
            }
            if (trimmed.includes('建议') || trimmed.includes('修改')) {
                section = 'suggestions';
                continue;
            }
            const cleaned = trimmed.replace(/^[\d]+[\.\、\)]\s*|^[•\-\*]\s*/, '');
            if (cleaned.length > 3) {
                if (section === 'summary' && !summary)
                    summary = cleaned;
                else if (section === 'issues') {
                    issues.push({
                        type: 'sentiment',
                        severity: 'medium',
                        message: cleaned,
                    });
                }
                else if (section === 'suggestions')
                    suggestions.push(cleaned);
            }
        }
        return { summary, issues, suggestions };
    }
};
exports.ContentReviewerService = ContentReviewerService;
exports.ContentReviewerService = ContentReviewerService = ContentReviewerService_1 = __decorate([
    (0, common_1.Injectable)()
], ContentReviewerService);
//# sourceMappingURL=content-reviewer.js.map