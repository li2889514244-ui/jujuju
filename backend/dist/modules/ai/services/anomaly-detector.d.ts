import { type AnomalyPoint } from '../utils/data-analyzer';
import type { DetectAnomalyDto } from '../dto/ai-request.dto';
export interface AnomalyReport {
    anomalies: AnomalyPoint[];
    summary: string;
    riskLevel: 'low' | 'medium' | 'high';
    possibleCauses: string[];
    recommendations: string[];
    statistics: {
        mean: number;
        stdDev: number;
        min: number;
        max: number;
        dataPoints: number;
    };
}
export declare class AnomalyDetectorService {
    private readonly logger;
    detect(dto: DetectAnomalyDto): Promise<AnomalyReport>;
    detectAccountRisk(accountData: {
        followers: number[];
        engagement: number[];
        publishFrequency: number[];
    }): Promise<{
        riskScore: number;
        issues: string[];
        recommendations: string[];
    }>;
    private inferCauses;
    private inferRecommendations;
    private generateSummary;
    private assessRisk;
    private parseAIResponse;
    private getEmptyReport;
}
