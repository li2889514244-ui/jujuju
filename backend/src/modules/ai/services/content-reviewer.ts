import { Injectable, Logger } from '@nestjs/common';
import { getProvider } from '../providers/ai-provider.interface';
import { renderTemplate } from '../utils/prompt-templates';
import { analyzeSentiment, extractKeywords, getTextStats, type SentimentResult } from '../utils/text-processor';
import type { ReviewContentDto } from '../dto/ai-request.dto';

// Sensitive word lists
const SENSITIVE_WORDS = {
  // Political
  political: ['习近平', '六四', '天安门', '法轮功', '台独', '藏独', '疆独'],
  // Violence
  violence: ['自杀', '自残', '炸弹', '枪击', '砍人', '爆炸物'],
  // Illegal
  illegal: ['赌博', '毒品', '色情', '代孕', '洗钱', '传销'],
  // Spam
  spam: ['免费领取', '日赚万元', '加微信', '扫码领', '点击链接'],
  // Platform-specific
  platform: ['刷粉', '刷赞', '买粉', '互刷', '僵尸粉'],
};

export interface ReviewResult {
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  score: number; // 0-100, higher = more risky
  issues: ReviewIssue[];
  sentiment: SentimentResult;
  suggestions: string[];
  summary: string;
}

export interface ReviewIssue {
  type: 'sensitive_word' | 'political' | 'violence' | 'illegal' | 'spam' | 'platform_violation' | 'sentiment';
  severity: 'low' | 'medium' | 'high';
  message: string;
  word?: string;
  position?: number;
}

@Injectable()
export class ContentReviewerService {
  private readonly logger = new Logger(ContentReviewerService.name);

  async review(dto: ReviewContentDto): Promise<ReviewResult> {
    const content = dto.content;
    const strictness = dto.strictness || 'normal';
    const issues: ReviewIssue[] = [];

    // 1. Sensitive word detection
    issues.push(...this.checkSensitiveWords(content, strictness));

    // 2. Sentiment analysis
    const sentiment = analyzeSentiment(content);

    // 3. Text statistics
    const stats = getTextStats(content);

    // 4. AI-powered review
    let aiSuggestions: string[] = [];
    let aiSummary = '';

    try {
      const provider = getProvider();
      const prompt = renderTemplate('content_review', {
        content: content.slice(0, 2000), // Limit length
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

      // Merge AI-detected issues
      issues.push(...parsed.issues);
    } catch (error) {
      this.logger.warn('AI content review failed, using rule-based review');
    }

    // 5. Platform-specific checks
    if (dto.platform) {
      issues.push(...this.platformSpecificCheck(content, dto.platform, strictness));
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(issues, sentiment, strictness);
    const riskLevel = riskScore >= 70 ? 'high' : riskScore >= 30 ? 'medium' : 'low';
    const passed = riskLevel !== 'high';

    // Generate suggestions
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
      suggestions: [...new Set(suggestions)], // deduplicate
      summary: aiSummary || this.generateSummary(passed, riskLevel, issues.length),
    };
  }

  private checkSensitiveWords(content: string, strictness: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];
    const lower = content.toLowerCase();
    const threshold = strictness === 'strict' ? 'low' : strictness === 'lenient' ? 'high' : 'medium';

    for (const [category, words] of Object.entries(SENSITIVE_WORDS)) {
      for (const word of words) {
        const index = lower.indexOf(word.toLowerCase());
        if (index !== -1) {
          const severity = category === 'political' || category === 'illegal' ? 'high' :
                          category === 'violence' ? 'high' :
                          category === 'spam' || category === 'platform' ? 'medium' : 'low';

          // Skip low-severity issues in lenient mode
          if (strictness === 'lenient' && severity === 'low') continue;

          issues.push({
            type: category as ReviewIssue['type'],
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

  private platformSpecificCheck(content: string, platform: string, strictness: string): ReviewIssue[] {
    const issues: ReviewIssue[] = [];

    // Check content length limits
    const limits: Record<string, number> = {
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

    // Check for external links
    if (content.match(/https?:\/\/[^\s]+/g)) {
      issues.push({
        type: 'platform_violation',
        severity: 'medium',
        message: `${platform}平台可能限制外部链接展示`,
      });
    }

    return issues;
  }

  private calculateRiskScore(issues: ReviewIssue[], sentiment: SentimentResult, strictness: string): number {
    let score = 0;

    for (const issue of issues) {
      switch (issue.severity) {
        case 'high': score += 30; break;
        case 'medium': score += 15; break;
        case 'low': score += 5; break;
      }
    }

    // Sentiment factor
    if (sentiment.label === 'negative' && sentiment.confidence > 0.6) {
      score += 10;
    }

    // Strictness modifier
    const modifier = strictness === 'strict' ? 1.3 : strictness === 'lenient' ? 0.7 : 1.0;
    score = Math.round(score * modifier);

    return Math.min(100, Math.max(0, score));
  }

  private generateSuggestions(issues: ReviewIssue[], sentiment: SentimentResult): string[] {
    const suggestions: string[] = [];

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

  private generateSummary(passed: boolean, riskLevel: string, issueCount: number): string {
    if (passed && issueCount === 0) {
      return '✅ 内容审核通过，未发现明显问题。';
    }
    if (passed) {
      return `⚠️ 内容审核通过，但存在${issueCount}个潜在风险点，建议优化后发布。`;
    }
    return `❌ 内容审核未通过，存在${issueCount}个高风险问题，请修改后重新提交。`;
  }

  private getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      political: '政治',
      violence: '暴力',
      illegal: '违法',
      spam: '营销',
      platform: '平台违规',
    };
    return labels[category] || '敏感';
  }

  private parseAIResponse(content: string): { summary: string; issues: ReviewIssue[]; suggestions: string[] } {
    const issues: ReviewIssue[] = [];
    const suggestions: string[] = [];
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
        if (section === 'summary' && !summary) summary = cleaned;
        else if (section === 'issues') {
          issues.push({
            type: 'sentiment',
            severity: 'medium',
            message: cleaned,
          });
        }
        else if (section === 'suggestions') suggestions.push(cleaned);
      }
    }

    return { summary, issues, suggestions };
  }
}
