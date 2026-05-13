import { type SentimentResult } from '../utils/text-processor';
import type { ReviewContentDto } from '../dto/ai-request.dto';
export interface ReviewResult {
    passed: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    score: number;
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
export declare class ContentReviewerService {
    private readonly logger;
    review(dto: ReviewContentDto): Promise<ReviewResult>;
    private checkSensitiveWords;
    private platformSpecificCheck;
    private calculateRiskScore;
    private generateSuggestions;
    private generateSummary;
    private getCategoryLabel;
    private parseAIResponse;
}
