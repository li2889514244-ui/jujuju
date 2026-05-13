import { GenerateContentDto, ContentType } from '../dto/ai-request.dto';
export interface ContentResult {
    type: ContentType;
    content: string;
    suggestions?: string[];
    keywords?: string[];
    stats?: Record<string, unknown>;
}
export declare class ContentGeneratorService {
    private readonly logger;
    generate(dto: GenerateContentDto): Promise<ContentResult>;
    generateBatch(items: GenerateContentDto[]): Promise<ContentResult[]>;
    generateTitle(topic: string, platform?: string, count?: number): Promise<string[]>;
    generateTags(topic: string, platform?: string): Promise<string[]>;
}
