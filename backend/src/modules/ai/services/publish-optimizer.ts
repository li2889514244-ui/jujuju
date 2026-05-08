import { Injectable, Logger } from '@nestjs/common';
import { getProvider } from '../providers/ai-provider.interface';
import { renderTemplate } from '../utils/prompt-templates';
import { analyzeBestTimes, type TimeSlot } from '../utils/data-analyzer';
import type { OptimizePublishDto } from '../dto/ai-request.dto';

export interface PublishTimeRecommendation {
  bestSlots: Array<{ day: string; hour: number; score: number; reason: string }>;
  avoidSlots: Array<{ day: string; hour: number; reason: string }>;
  frequency: {
    daily: number;
    weekly: number;
    description: string;
  };
  tips: string[];
}

// Platform default best times (fallback when no AI)
const PLATFORM_DEFAULTS: Record<string, { peakHours: number[]; peakDays: string[] }> = {
  douyin: { peakHours: [12, 18, 21], peakDays: ['周五', '周六', '周日'] },
  kuaishou: { peakHours: [7, 12, 20], peakDays: ['周三', '周六', '周日'] },
  xiaohongshu: { peakHours: [12, 18, 22], peakDays: ['周四', '周五', '周六'] },
  video_account: { peakHours: [8, 12, 20], peakDays: ['周二', '周四', '周日'] },
  bilibili: { peakHours: [12, 18, 21], peakDays: ['周五', '周六', '周日'] },
  weibo: { peakHours: [9, 12, 22], peakDays: ['周一', '周三', '周五'] },
};

@Injectable()
export class PublishOptimizerService {
  private readonly logger = new Logger(PublishOptimizerService.name);

  async getBestPublishTime(dto: OptimizePublishDto): Promise<PublishTimeRecommendation> {
    const provider = getProvider();
    const platform = dto.platform || 'douyin';

    // Try AI-based analysis
    try {
      const prompt = renderTemplate('best_publish_time', {
        platform,
        contentType: dto.contentType || '短视频',
        audience: dto.audience || '年轻用户',
        historicalData: dto.historicalData || '',
      });

      const response = await provider.complete({
        prompt,
        systemPrompt: '你是一位资深社交媒体运营分析师，擅长分析最佳发布时间。',
        temperature: 0.5,
      });

      return this.parseTimeRecommendation(response.content, platform);
    } catch (error) {
      this.logger.warn('AI publish time analysis failed, using defaults', error);
      return this.getDefaultRecommendation(platform);
    }
  }

  async getPublishFrequency(dto: OptimizePublishDto): Promise<{ frequency: string; tips: string[] }> {
    const provider = getProvider();
    const platform = dto.platform || 'douyin';

    try {
      const prompt = renderTemplate('publish_frequency', {
        platform,
        contentType: dto.contentType || '短视频',
        audience: dto.audience || '年轻用户',
        historicalData: dto.historicalData || '',
      });

      const response = await provider.complete({
        prompt,
        systemPrompt: '你是一位内容运营策略专家。',
        temperature: 0.5,
      });

      return {
        frequency: response.content,
        tips: this.extractTips(response.content),
      };
    } catch (error) {
      this.logger.warn('AI frequency analysis failed, using defaults', error);
      return {
        frequency: '建议每日发布1-2条内容，保持稳定输出节奏。',
        tips: ['保持每天固定时间发布', '内容类型多样化', '关注数据反馈及时调整'],
      };
    }
  }

  analyzeHistoricalBestTime(data: Array<{ hour: number; dayOfWeek: number; engagement: number }>): TimeSlot[] {
    return analyzeBestTimes(data);
  }

  private parseTimeRecommendation(content: string, platform: string): PublishTimeRecommendation {
    // Extract numbers that look like hours
    const hourMatches = content.match(/(\d{1,2})[:\s]*[时点]/g) || [];
    const hours = hourMatches
      .map((m) => parseInt(m.match(/\d+/)?.[0] || '0'))
      .filter((h) => h >= 0 && h <= 23);

    const bestSlots = hours.slice(0, 3).map((hour, i) => ({
      day: PLATFORM_DEFAULTS[platform]?.peakDays[i] || '工作日',
      hour,
      score: 90 - i * 10,
      reason: `根据${platform}平台数据分析，该时段用户活跃度较高`,
    }));

    return {
      bestSlots: bestSlots.length > 0 ? bestSlots : this.getDefaultRecommendation(platform).bestSlots,
      avoidSlots: [
        { day: '每天', hour: 2, reason: '凌晨时段用户活跃度极低' },
        { day: '每天', hour: 5, reason: '清晨时段不适合发布' },
      ],
      frequency: {
        daily: platform === 'xiaohongshu' ? 1 : 2,
        weekly: platform === 'xiaohongshu' ? 5 : 10,
        description: `建议${platform === 'xiaohongshu' ? '每天1条' : '每天1-2条'}，保持稳定输出`,
      },
      tips: this.extractTips(content),
    };
  }

  private getDefaultRecommendation(platform: string): PublishTimeRecommendation {
    const defaults = PLATFORM_DEFAULTS[platform] || PLATFORM_DEFAULTS.douyin;
    return {
      bestSlots: defaults.peakHours.map((hour, i) => ({
        day: defaults.peakDays[i],
        hour,
        score: 90 - i * 10,
        reason: `${platform}平台默认推荐时段`,
      })),
      avoidSlots: [
        { day: '每天', hour: 2, reason: '凌晨时段' },
        { day: '每天', hour: 5, reason: '清晨时段' },
      ],
      frequency: {
        daily: 2,
        weekly: 10,
        description: '建议每天发布1-2条内容',
      },
      tips: ['保持固定发布时间', '内容质量优先于数量', '观察数据反馈调整策略'],
    };
  }

  private extractTips(content: string): string[] {
    const tips: string[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^[•\-\*]\s+/) || trimmed.match(/^\d+[\.\、]/)) {
        tips.push(trimmed.replace(/^[•\-\*]\s+|^\d+[\.\、]\s*/, ''));
      }
    }
    return tips.length > 0 ? tips : ['保持发布频率稳定', '关注平台数据反馈', '根据受众活跃时间调整'];
  }
}
