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
var ContentReviewService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContentReviewService = void 0;
const common_1 = require("@nestjs/common");
const fs = require("fs");
const path = require("path");
let ContentReviewService = ContentReviewService_1 = class ContentReviewService {
    constructor() {
        this.logger = new common_1.Logger(ContentReviewService_1.name);
        this.highSeverityWords = [];
        this.mediumSeverityWords = [];
        this.lowSeverityWords = [];
        this.lastLoadTime = 0;
        this.contactPatterns = [
            /1[3-9]\d{9}/,
            /\d{5,10}@(qq|163|gmail|outlook)\.(com|cn)/,
            /[Vv]信[:：]?\s*\w+/,
            /[Qq][Qq][:：]?\s*\d{5,12}/,
            /https?:\/\/[^\s]+/,
            /t\.cn\/\w+/,
            /bit\.ly\/\w+/,
        ];
        this.adPatterns = [
            /[￥¥]\d+/,
            /优惠[券码]/,
            /下单.*立减/,
            /复制.*淘口令/,
        ];
        this.loadSensitiveWords();
    }
    loadSensitiveWords() {
        try {
            const filePath = path.join(__dirname, 'sensitive-words.json');
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            this.highSeverityWords = data.highSeverityWords || [];
            this.mediumSeverityWords = data.mediumSeverityWords || [];
            this.lowSeverityWords = data.lowSeverityWords || [];
            this.lastLoadTime = Date.now();
            this.logger.log(`敏感词库已加载: 高危${this.highSeverityWords.length} 中危${this.mediumSeverityWords.length} 低危${this.lowSeverityWords.length}`);
        }
        catch (err) {
            this.logger.error(`加载敏感词库失败: ${err.message}`);
        }
    }
    ensureWordsLoaded() {
        if (Date.now() - this.lastLoadTime > 5 * 60 * 1000) {
            this.loadSensitiveWords();
        }
    }
    async review(text, title) {
        this.ensureWordsLoaded();
        const fullText = `${title || ''} ${text}`;
        const violations = [];
        this.checkWordList(fullText, this.highSeverityWords, 'SENSITIVE_WORD', 'HIGH', violations);
        this.checkWordList(fullText, this.mediumSeverityWords, 'AD_SUSPICION', 'MEDIUM', violations);
        this.checkWordList(fullText, this.lowSeverityWords, 'SENSITIVE_WORD', 'LOW', violations);
        this.checkPatterns(fullText, this.contactPatterns, 'CONTACT_INFO', 'MEDIUM', violations);
        this.checkPatterns(fullText, this.adPatterns, 'AD_SUSPICION', 'LOW', violations);
        const score = this.calculateScore(violations);
        const passed = violations.filter((v) => v.severity === 'HIGH').length === 0;
        if (violations.length > 0) {
            this.logger.warn(`内容审核发现 ${violations.length} 处违规，安全分: ${score}`);
        }
        return { passed, violations, score };
    }
    async quickCheck(text) {
        this.ensureWordsLoaded();
        const highlights = [];
        for (const word of this.highSeverityWords) {
            if (text.includes(word)) {
                highlights.push({ word, severity: 'HIGH' });
            }
        }
        for (const word of this.mediumSeverityWords) {
            if (text.includes(word)) {
                highlights.push({ word, severity: 'MEDIUM' });
            }
        }
        for (const word of this.lowSeverityWords) {
            if (text.includes(word)) {
                highlights.push({ word, severity: 'LOW' });
            }
        }
        return { passed: highlights.filter((h) => h.severity === 'HIGH').length === 0, highlights };
    }
    checkWordList(text, words, type, severity, violations) {
        for (const word of words) {
            let pos = text.indexOf(word);
            while (pos !== -1) {
                const start = Math.max(0, pos - 10);
                const end = Math.min(text.length, pos + word.length + 10);
                violations.push({
                    type,
                    keyword: word,
                    position: pos,
                    context: text.slice(start, end),
                    severity,
                    suggestion: this.getSuggestion(word, type),
                });
                pos = text.indexOf(word, pos + 1);
            }
        }
    }
    checkPatterns(text, patterns, type, severity, violations) {
        for (const pattern of patterns) {
            const globalPattern = new RegExp(pattern.source, 'g');
            let match;
            while ((match = globalPattern.exec(text)) !== null) {
                const pos = match.index;
                const start = Math.max(0, pos - 10);
                const end = Math.min(text.length, pos + match[0].length + 10);
                violations.push({
                    type,
                    keyword: match[0],
                    position: pos,
                    context: text.slice(start, end),
                    severity,
                    suggestion: '建议移除联系方式或外链，避免平台限流',
                });
            }
        }
    }
    calculateScore(violations) {
        let score = 100;
        for (const v of violations) {
            switch (v.severity) {
                case 'HIGH':
                    score -= 30;
                    break;
                case 'MEDIUM':
                    score -= 15;
                    break;
                case 'LOW':
                    score -= 5;
                    break;
            }
        }
        return Math.max(0, score);
    }
    getSuggestion(word, type) {
        if (type === 'AD_SUSPICION')
            return `"${word}" 可能触发平台广告检测，建议换一种表达`;
        if (type === 'SENSITIVE_WORD')
            return `"${word}" 属于敏感词，建议删除或替换`;
        return `建议移除 "${word}"`;
    }
};
exports.ContentReviewService = ContentReviewService;
exports.ContentReviewService = ContentReviewService = ContentReviewService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], ContentReviewService);
//# sourceMappingURL=content-review.service.js.map