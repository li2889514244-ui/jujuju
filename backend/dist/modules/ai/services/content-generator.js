"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ContentGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const ai_provider_interface_1 = require("../providers/ai-provider.interface");
const prompt_templates_1 = require("../utils/prompt-templates");
const text_processor_1 = require("../utils/text-processor");
const ai_request_dto_1 = require("../dto/ai-request.dto");
let ContentGeneratorService = ContentGeneratorService_1 = class ContentGeneratorService {
    constructor() {
        this.logger = new common_1.Logger(ContentGeneratorService_1.name);
    }
    async generate(dto) {
        const provider = (0, ai_provider_interface_1.getProvider)();
        this.logger.log(`Generating ${dto.type} for topic: ${dto.topic}`);
        const templateMap = {
            video_script: 'video_script',
            title: 'title_optimization',
            tags: 'tag_recommendation',
            caption: 'caption_generation',
        };
        const templateId = templateMap[dto.type];
        const prompt = (0, prompt_templates_1.renderTemplate)(templateId, {
            topic: dto.topic,
            platform: dto.platform || '抖音',
            audience: dto.audience || '年轻用户',
            style: dto.style || '轻松有趣',
            reference: dto.reference || '',
            count: dto.count || 3,
        });
        const response = await provider.complete({
            prompt,
            systemPrompt: '你是一位专业的短视频内容创作和运营专家。',
            temperature: 0.8,
            maxTokens: 2000,
        });
        const keywords = (0, text_processor_1.extractKeywords)(response.content, 8);
        const stats = (0, text_processor_1.getTextStats)(response.content);
        return {
            type: dto.type,
            content: response.content,
            keywords: keywords.map((k) => k.keyword),
            stats: stats,
        };
    }
    async generateBatch(items) {
        const results = [];
        for (const item of items) {
            results.push(await this.generate(item));
        }
        return results;
    }
    async generateTitle(topic, platform, count = 5) {
        const result = await this.generate({
            type: ai_request_dto_1.ContentType.TITLE,
            topic,
            platform,
            count,
        });
        const titles = result.content.match(/\d+\.\s*(.+?)(?:\n|$)/g) || [];
        return titles.map((t) => t.replace(/^\d+\.\s*/, '').trim());
    }
    async generateTags(topic, platform) {
        const result = await this.generate({
            type: ai_request_dto_1.ContentType.TAGS,
            topic,
            platform,
        });
        const tags = result.content.match(/#[\u4e00-\u9fff\w]+/g) || [];
        return tags.map((t) => t.replace(/^#/, ''));
    }
};
exports.ContentGeneratorService = ContentGeneratorService;
exports.ContentGeneratorService = ContentGeneratorService = ContentGeneratorService_1 = __decorate([
    (0, common_1.Injectable)()
], ContentGeneratorService);
//# sourceMappingURL=content-generator.js.map