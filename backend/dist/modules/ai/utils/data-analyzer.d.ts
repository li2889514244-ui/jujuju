export declare function mean(values: number[]): number;
export declare function median(values: number[]): number;
export declare function standardDeviation(values: number[]): number;
export declare function percentile(values: number[], p: number): number;
export interface TrendResult {
    direction: 'up' | 'down' | 'stable';
    slope: number;
    r2: number;
    predicted: number[];
    forecast: number[];
}
export declare function linearRegression(x: number[], y: number[]): {
    slope: number;
    intercept: number;
    r2: number;
};
export declare function calculateTrend(values: number[], forecastDays?: number): TrendResult;
export declare function growthRate(current: number, previous: number): number;
export declare function compoundGrowthRate(values: number[]): number;
export interface AnomalyPoint {
    index: number;
    value: number;
    zScore: number;
    type: 'spike' | 'drop' | 'outlier';
}
export declare function detectAnomalies(values: number[], sensitivity?: 'low' | 'medium' | 'high'): AnomalyPoint[];
export declare function movingAverage(values: number[], window?: number): number[];
export declare function calculateEngagement(likes: number, comments: number, shares: number, followers: number): number;
export interface TimeSlot {
    hour: number;
    dayOfWeek: number;
    score: number;
}
export declare function analyzeBestTimes(data: Array<{
    hour: number;
    dayOfWeek: number;
    engagement: number;
}>): TimeSlot[];
