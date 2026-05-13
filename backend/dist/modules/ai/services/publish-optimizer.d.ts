import { type TimeSlot } from '../utils/data-analyzer';
import type { OptimizePublishDto } from '../dto/ai-request.dto';
export interface PublishTimeRecommendation {
    bestSlots: Array<{
        day: string;
        hour: number;
        score: number;
        reason: string;
    }>;
    avoidSlots: Array<{
        day: string;
        hour: number;
        reason: string;
    }>;
    frequency: {
        daily: number;
        weekly: number;
        description: string;
    };
    tips: string[];
}
export declare class PublishOptimizerService {
    private readonly logger;
    getBestPublishTime(dto: OptimizePublishDto): Promise<PublishTimeRecommendation>;
    getPublishFrequency(dto: OptimizePublishDto): Promise<{
        frequency: string;
        tips: string[];
    }>;
    analyzeHistoricalBestTime(data: Array<{
        hour: number;
        dayOfWeek: number;
        engagement: number;
    }>): TimeSlot[];
    private parseTimeRecommendation;
    private getDefaultRecommendation;
    private extractTips;
}
