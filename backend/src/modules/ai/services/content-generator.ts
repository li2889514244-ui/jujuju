import { Injectable, Logger } from '@nestjs/common';
import { getProvider } from '../providers/ai-provider.interface';
import { renderTemplate } from '../utils/prompt-templates';
import { extractKeywords, getTextStats } from '../utils/text-processor';
import { GenerateContentDto, ContentType } from '../dto/ai-request.dto';

export interface ContentResult {
  type: ContentType;
  content: string;
  suggestions?: string[];
  keywords?: string[];
  stats?: Record<string, unknown>;
}

@Injectable()
export class ContentGeneratorService {
  private readonly logger = new Logger(ContentGeneratorService.name);

  async generate(dto: GenerateContentDto): Promise<ContentResult> {
    const provider = getProvider();
    this.logger.log(`Generating ${dto.type} for topic: ${dto.topic}`);

    const templateMap: Record<ContentType, string> = {
      video_script: 'video_script',
      title: 'title_optimization',
      tags: 'tag_recommendation',
      caption: 'caption_generation',
    };

    const templateId = templateMap[dto.type];
    const prompt = renderTemplate(templateId, {
      topic: dto.topic,
      platform: dto.platform || '抖音',
      audience: dto.audience || '年轻用户',
      style: dto.style || '轻松有趣',
      reference: dto.reference || '',
      count: dto.count || 3,
    });

    const response = await provider.complete({
      prompt,
      systemPrompt: '你是一位专业的短视频内容创作和运营专家。',
      temperature: 0.8,
      maxTokens: 2000,
    });

    const keywords = extractKeywords(response.content, 8);
    const stats = getTextStats(response.content);

    return {
      type: dto.type,
      content: response.content,
      keywords: keywords.map((k) => k.keyword),
      stats: stats as unknown as Record<string, unknown>,
    };
  }

  async generateBatch(items: GenerateContentDto[]): Promise<ContentResult[]> {
    const results: ContentResult[] = [];
    for (const item of items) {
      results.push(await this.generate(item));
    }
    return results;
  }

  // Quick helpers
  async generateTitle(topic: string, platform?: string, count: number = 5): Promise<string[]> {
    const result = await this.generate({
      type: ContentType.TITLE,
      topic,
      platform,
      count,
    });
    // Extract titles from response
    const titles = result.content.match(/\d+\.\s*(.+?)(?:\n|$)/g) || [];
    return titles.map((t) => t.replace(/^\d+\.\s*/, '').trim());
  }

  async generateTags(topic: string, platform?: string): Promise<string[]> {
    const result = await this.generate({
      type: ContentType.TAGS,
      topic,
      platform,
    });
    const tags = result.content.match(/#[\u4e00-\u9fff\w]+/g) || [];
    return tags.map((t) => t.replace(/^#/, ''));
  }
}
