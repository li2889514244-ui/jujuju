import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface ReviewResult {
  passed: boolean;
  violations: Violation[];
  score: number; // 0-100, 100 = 完全安全
}

export interface Violation {
  type: 'SENSITIVE_WORD' | 'BANNED_TOPIC' | 'AD_SUSPICION' | 'CONTACT_INFO' | 'POLITICAL';
  keyword: string;
  position: number;
  context: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestion?: string;
}

/**
 * 内容违规检测服务
 * 基于敏感词库 + 正则规则引擎，发布前自动扫描
 * 词库从 JSON 配置文件加载，支持热更新
 */
@Injectable()
export class ContentReviewService {
  private readonly logger = new Logger(ContentReviewService.name);

  private highSeverityWords: string[] = [];
  private mediumSeverityWords: string[] = [];
  private lowSeverityWords: string[] = [];
  private lastLoadTime = 0;

  constructor() {
    this.loadSensitiveWords();
  }

  /**
   * 加载敏感词库（每5分钟自动重新加载）
   */
  private loadSensitiveWords() {
    try {
      const filePath = path.join(__dirname, 'sensitive-words.json');
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      this.highSeverityWords = data.highSeverityWords || [];
      this.mediumSeverityWords = data.mediumSeverityWords || [];
      this.lowSeverityWords = data.lowSeverityWords || [];
      this.lastLoadTime = Date.now();
      this.logger.log(`敏感词库已加载: 高危${this.highSeverityWords.length} 中危${this.mediumSeverityWords.length} 低危${this.lowSeverityWords.length}`);
    } catch (err: any) {
      this.logger.error(`加载敏感词库失败: ${err.message}`);
    }
  }

  /**
   * 检查是否需要重新加载词库（5分钟缓存）
   */
  private ensureWordsLoaded() {
    if (Date.now() - this.lastLoadTime > 5 * 60 * 1000) {
      this.loadSensitiveWords();
    }
  }

  // 联系方式正则
  private readonly contactPatterns: RegExp[] = [
    /1[3-9]\d{9}/, // 手机号
    /\d{5,10}@(qq|163|gmail|outlook)\.(com|cn)/, // 邮箱
    /[Vv]信[:：]?\s*\w+/, // 微信号
    /[Qq][Qq][:：]?\s*\d{5,12}/, // QQ号
    /https?:\/\/[^\s]+/, // 外链
    /t\.cn\/\w+/, // 短链接
    /bit\.ly\/\w+/,
  ];

  // 广告嫌疑正则
  private readonly adPatterns: RegExp[] = [
    /[￥¥]\d+/, // 价格标注
    /优惠[券码]/, // 优惠信息
    /下单.*立减/, // 促销话术
    /复制.*淘口令/, // 淘宝口令
  ];

  /**
   * 审核内容
   */
  async review(text: string, title?: string): Promise<ReviewResult> {
    this.ensureWordsLoaded();
    const fullText = `${title || ''} ${text}`;
    const violations: Violation[] = [];

    // 1. 敏感词检测
    this.checkWordList(fullText, this.highSeverityWords, 'SENSITIVE_WORD', 'HIGH', violations);
    this.checkWordList(fullText, this.mediumSeverityWords, 'AD_SUSPICION', 'MEDIUM', violations);
    this.checkWordList(fullText, this.lowSeverityWords, 'SENSITIVE_WORD', 'LOW', violations);

    // 2. 联系方式检测
    this.checkPatterns(fullText, this.contactPatterns, 'CONTACT_INFO', 'MEDIUM', violations);

    // 3. 广告嫌疑检测
    this.checkPatterns(fullText, this.adPatterns, 'AD_SUSPICION', 'LOW', violations);

    // 计算安全分
    const score = this.calculateScore(violations);
    const passed = violations.filter((v) => v.severity === 'HIGH').length === 0;

    if (violations.length > 0) {
      this.logger.warn(`内容审核发现 ${violations.length} 处违规，安全分: ${score}`);
    }

    return { passed, violations, score };
  }

  /**
   * 快速检测（仅返回是否通过，用于实时输入提示）
   */
  async quickCheck(text: string): Promise<{ passed: boolean; highlights: { word: string; severity: string }[] }> {
    this.ensureWordsLoaded();
    const highlights: { word: string; severity: string }[] = [];

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

  private checkWordList(
    text: string,
    words: string[],
    type: Violation['type'],
    severity: Violation['severity'],
    violations: Violation[],
  ) {
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

  private checkPatterns(
    text: string,
    patterns: RegExp[],
    type: Violation['type'],
    severity: Violation['severity'],
    violations: Violation[],
  ) {
    for (const pattern of patterns) {
      const globalPattern = new RegExp(pattern.source, 'g');
      let match: RegExpExecArray | null;
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

  private calculateScore(violations: Violation[]): number {
    let score = 100;
    for (const v of violations) {
      switch (v.severity) {
        case 'HIGH': score -= 30; break;
        case 'MEDIUM': score -= 15; break;
        case 'LOW': score -= 5; break;
      }
    }
    return Math.max(0, score);
  }

  private getSuggestion(word: string, type: Violation['type']): string {
    if (type === 'AD_SUSPICION') return `"${word}" 可能触发平台广告检测，建议换一种表达`;
    if (type === 'SENSITIVE_WORD') return `"${word}" 属于敏感词，建议删除或替换`;
    return `建议移除 "${word}"`;
  }
}
