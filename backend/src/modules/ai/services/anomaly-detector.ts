import { Injectable, Logger } from '@nestjs/common';
import { getProvider } from '../providers/ai-provider.interface';
import { renderTemplate } from '../utils/prompt-templates';
import { detectAnomalies, mean, standardDeviation, type AnomalyPoint } from '../utils/data-analyzer';
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

@Injectable()
export class AnomalyDetectorService {
  private readonly logger = new Logger(AnomalyDetectorService.name);

  async detect(dto: DetectAnomalyDto): Promise<AnomalyReport> {
    const sensitivity = dto.sensitivity || 'medium';

    // Parse dataset
    let values: number[] = [];
    if (dto.dataset) {
      try {
        values = JSON.parse(dto.dataset);
      } catch {
        this.logger.warn('Invalid dataset JSON');
        return this.getEmptyReport('数据格式无效，无法解析');
      }
    }

    if (values.length < 3) {
      return this.getEmptyReport('数据点不足（至少需要3个），无法进行异常检测');
    }

    // Statistical anomaly detection
    const anomalies = detectAnomalies(values, sensitivity);
    const avg = mean(values);
    const std = standardDeviation(values);

    // AI-powered analysis
    let possibleCauses: string[] = [];
    let recommendations: string[] = [];
    let summary = '';

    try {
      const provider = getProvider();
      const prompt = renderTemplate('data_anomaly', {
        metric: dto.metric || '综合指标',
        platform: dto.platform || '全平台',
        dataset: JSON.stringify(values.slice(-30)),
        sensitivity,
      });

      const response = await provider.complete({
        prompt,
        systemPrompt: '你是一位数据分析师，擅长识别数据异常和风险。',
        temperature: 0.4,
        maxTokens: 1000,
      });

      const parsed = this.parseAIResponse(response.content);
      possibleCauses = parsed.causes;
      recommendations = parsed.recommendations;
      summary = parsed.summary;
    } catch (error) {
      this.logger.warn('AI anomaly analysis failed, using statistical analysis');
    }

    // Fallback analysis
    if (possibleCauses.length === 0) {
      possibleCauses = this.inferCauses(anomalies, dto.metric);
    }
    if (recommendations.length === 0) {
      recommendations = this.inferRecommendations(anomalies, dto.metric);
    }
    if (!summary) {
      summary = this.generateSummary(anomalies, values.length);
    }

    const riskLevel = this.assessRisk(anomalies, values.length);

    return {
      anomalies,
      summary,
      riskLevel,
      possibleCauses,
      recommendations,
      statistics: {
        mean: avg,
        stdDev: std,
        min: Math.min(...values),
        max: Math.max(...values),
        dataPoints: values.length,
      },
    };
  }

  async detectAccountRisk(accountData: {
    followers: number[];
    engagement: number[];
    publishFrequency: number[];
  }): Promise<{ riskScore: number; issues: string[]; recommendations: string[] }> {
    const followerAnomalies = detectAnomalies(accountData.followers, 'high');
    const engagementAnomalies = detectAnomalies(accountData.engagement, 'medium');
    const frequencyAnomalies = detectAnomalies(accountData.publishFrequency, 'medium');

    const totalAnomalies = followerAnomalies.length + engagementAnomalies.length + frequencyAnomalies.length;
    const riskScore = Math.min(100, totalAnomalies * 15);

    const issues: string[] = [];
    if (followerAnomalies.length > 0) {
      const drops = followerAnomalies.filter((a) => a.type === 'drop');
      if (drops.length > 0) issues.push(`检测到${drops.length}次粉丝异常下降`);
    }
    if (engagementAnomalies.length > 0) {
      issues.push(`互动数据存在${engagementAnomalies.length}处异常波动`);
    }
    if (frequencyAnomalies.length > 0) {
      issues.push(`发布频率不稳定，存在${frequencyAnomalies.length}处异常`);
    }

    const recommendations: string[] = [];
    if (riskScore > 50) {
      recommendations.push('立即检查账号状态，确认是否存在违规风险');
      recommendations.push('暂停发布，等待数据恢复正常');
    } else if (riskScore > 20) {
      recommendations.push('关注数据变化，持续监控');
      recommendations.push('优化内容质量，提升自然互动');
    } else {
      recommendations.push('账号状态良好，保持当前运营节奏');
    }

    return { riskScore, issues, recommendations };
  }

  private inferCauses(anomalies: AnomalyPoint[], metric?: string): string[] {
    const causes: string[] = [];
    const spikes = anomalies.filter((a) => a.type === 'spike');
    const drops = anomalies.filter((a) => a.type === 'drop');

    if (spikes.length > 0) {
      causes.push('可能因某条内容爆发导致数据突增');
      causes.push('平台推荐或热点话题带来的流量');
      causes.push('可能存在刷量行为（需人工确认）');
    }
    if (drops.length > 0) {
      causes.push('可能因内容质量下降导致互动减少');
      causes.push('平台算法调整影响了推荐量');
      causes.push('账号可能受到限流或处罚');
    }

    return causes.length > 0 ? causes : ['暂无法确定异常原因，建议人工排查'];
  }

  private inferRecommendations(anomalies: AnomalyPoint[], metric?: string): string[] {
    const recs: string[] = [];

    if (anomalies.some((a) => a.type === 'drop')) {
      recs.push('检查近期内容是否违规');
      recs.push('分析下降时间点前后的运营动作');
      recs.push('暂时降低发布频率，观察数据恢复');
    }
    if (anomalies.some((a) => a.type === 'spike')) {
      recs.push('分析爆款内容特征，总结经验');
      recs.push('趁流量高峰及时发布相关内容');
    }

    recs.push('持续监控数据变化趋势');
    return recs;
  }

  private generateSummary(anomalies: AnomalyPoint[], totalPoints: number): string {
    if (anomalies.length === 0) {
      return `分析了${totalPoints}个数据点，未发现明显异常，数据表现正常。`;
    }

    const spikes = anomalies.filter((a) => a.type === 'spike').length;
    const drops = anomalies.filter((a) => a.type === 'drop').length;

    return `分析了${totalPoints}个数据点，发现${anomalies.length}处异常：${spikes}次突增，${drops}次突降。异常比例${((anomalies.length / totalPoints) * 100).toFixed(1)}%。`;
  }

  private assessRisk(anomalies: AnomalyPoint[], totalPoints: number): 'low' | 'medium' | 'high' {
    const ratio = anomalies.length / totalPoints;
    if (ratio > 0.15) return 'high';
    if (ratio > 0.05) return 'medium';
    return 'low';
  }

  private parseAIResponse(content: string): { summary: string; causes: string[]; recommendations: string[] } {
    const causes: string[] = [];
    const recommendations: string[] = [];
    let summary = '';

    const lines = content.split('\n');
    let section = 'summary';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes('原因') || trimmed.includes('可能')) {
        section = 'causes';
        continue;
      }
      if (trimmed.includes('建议') || trimmed.includes('措施') || trimmed.includes('处理')) {
        section = 'recommendations';
        continue;
      }

      const cleaned = trimmed.replace(/^[\d]+[\.\、\)]\s*|^[•\-\*]\s*/, '');
      if (cleaned.length > 3) {
        if (section === 'summary' && !summary) summary = cleaned;
        else if (section === 'causes') causes.push(cleaned);
        else if (section === 'recommendations') recommendations.push(cleaned);
      }
    }

    return { summary, causes, recommendations };
  }

  private getEmptyReport(message: string): AnomalyReport {
    return {
      anomalies: [],
      summary: message,
      riskLevel: 'low',
      possibleCauses: [],
      recommendations: ['请提供足够的数据以进行分析'],
      statistics: { mean: 0, stdDev: 0, min: 0, max: 0, dataPoints: 0 },
    };
  }
}
