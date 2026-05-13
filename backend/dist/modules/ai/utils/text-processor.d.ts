export declare function segmentText(text: string): string[];
export interface KeywordResult {
    keyword: string;
    score: number;
    frequency: number;
}
export declare function extractKeywords(text: string, topK?: number): KeywordResult[];
export interface SentimentResult {
    score: number;
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
    positiveWords: string[];
    negativeWords: string[];
}
export declare function analyzeSentiment(text: string): SentimentResult;
export declare function textSimilarity(a: string, b: string): number;
export interface TextStats {
    charCount: number;
    wordCount: number;
    lineCount: number;
    avgWordLength: number;
    chineseCharCount: number;
    englishWordCount: number;
    emojiCount: number;
}
export declare function getTextStats(text: string): TextStats;
