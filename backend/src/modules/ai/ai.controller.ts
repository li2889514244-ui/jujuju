import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AIService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  GenerateContentDto,
  OptimizePublishDto,
  PredictTrendDto,
  DetectAnomalyDto,
  ReviewContentDto,
} from './dto/ai-request.dto';

@ApiTags('ai')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  // ===== Content Generation =====

  @Post('content/generate')
  @ApiOperation({ summary: '智能内容生成（脚本/标题/标签/文案）' })
  async generateContent(@Body() dto: GenerateContentDto) {
    return this.aiService.generateContent(dto);
  }

  @Post('content/batch')
  @ApiOperation({ summary: '批量内容生成' })
  async generateBatch(@Body() items: GenerateContentDto[]) {
    return this.aiService.generateBatchContent(items);
  }

  @Post('content/titles')
  @ApiOperation({ summary: '快速标题生成' })
  async generateTitles(
    @Body() body: { topic: string; platform?: string; count?: number },
  ) {
    return this.aiService.generateTitles(body.topic, body.platform, body.count);
  }

  @Post('content/tags')
  @ApiOperation({ summary: '快速标签推荐' })
  async generateTags(
    @Body() body: { topic: string; platform?: string },
  ) {
    return this.aiService.generateTags(body.topic, body.platform);
  }

  // ===== Publish Optimization =====

  @Post('publish/best-time')
  @ApiOperation({ summary: '最佳发布时间推荐' })
  async getBestPublishTime(@Body() dto: OptimizePublishDto) {
    return this.aiService.getBestPublishTime(dto);
  }

  @Post('publish/frequency')
  @ApiOperation({ summary: '发布频率优化建议' })
  async getPublishFrequency(@Body() dto: OptimizePublishDto) {
    return this.aiService.getPublishFrequency(dto);
  }

  // ===== Trend Prediction =====

  @Post('trend/predict')
  @ApiOperation({ summary: '趋势预测（粉丝/播放/互动）' })
  async predictTrend(@Body() dto: PredictTrendDto) {
    return this.aiService.predictTrend(dto);
  }

  // ===== Anomaly Detection =====

  @Post('anomaly/detect')
  @ApiOperation({ summary: '数据异常检测' })
  async detectAnomaly(@Body() dto: DetectAnomalyDto) {
    return this.aiService.detectAnomaly(dto);
  }

  @Post('anomaly/account-risk')
  @ApiOperation({ summary: '账号风险检测' })
  async detectAccountRisk(
    @Body()
    body: {
      followers: number[];
      engagement: number[];
      publishFrequency: number[];
    },
  ) {
    return this.aiService.detectAccountRisk(body);
  }

  // ===== Content Review =====

  @Post('review')
  @ApiOperation({ summary: '内容审核（违规检测/敏感词过滤）' })
  async reviewContent(@Body() dto: ReviewContentDto) {
    return this.aiService.reviewContent(dto);
  }

  // ===== System =====

  @Get('providers')
  @ApiOperation({ summary: '获取可用AI提供商列表' })
  async getProviders() {
    return this.aiService.getProviders();
  }

  @Get('capabilities')
  @ApiOperation({ summary: '获取AI能力清单' })
  async getCapabilities() {
    return this.aiService.getCapabilities();
  }
}
