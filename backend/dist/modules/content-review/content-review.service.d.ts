export interface ReviewResult {
    passed: boolean;
    violations: Violation[];
    score: number;
}
export interface Violation {
    type: 'SENSITIVE_WORD' | 'BANNED_TOPIC' | 'AD_SUSPICION' | 'CONTACT_INFO' | 'POLITICAL';
    keyword: string;
    position: number;
    context: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    suggestion?: string;
}
export declare class ContentReviewService {
    private readonly logger;
    private highSeverityWords;
    private mediumSeverityWords;
    private lowSeverityWords;
    private lastLoadTime;
    constructor();
    private loadSensitiveWords;
    private ensureWordsLoaded;
    private readonly contactPatterns;
    private readonly adPatterns;
    review(text: string, title?: string): Promise<ReviewResult>;
    quickCheck(text: string): Promise<{
        passed: boolean;
        highlights: {
            word: string;
            severity: string;
        }[];
    }>;
    private checkWordList;
    private checkPatterns;
    private calculateScore;
    private getSuggestion;
}
