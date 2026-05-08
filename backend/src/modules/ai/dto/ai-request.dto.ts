import { IsString, IsOptional, IsEnum, IsArray, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ===== Content Generation =====

export enum ContentType {
  VIDEO_SCRIPT = 'video_script',
  TITLE = 'title',
  TAGS = 'tags',
  CAPTION = 'caption',
}

export class GenerateContentDto {
  @ApiProperty({ enum: ContentType, description: '内容类型' })
  @IsEnum(ContentType)
  type!: ContentType;

  @ApiProperty({ description: '主题/关键词' })
  @IsString()
  topic!: string;

  @ApiPropertyOptional({ description: '平台' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '目标受众' })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiPropertyOptional({ description: '风格/语气' })
  @IsOptional()
  @IsString()
  style?: string;

  @ApiPropertyOptional({ description: '参考内容' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: '生成数量', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  count?: number;
}

// ===== Publish Optimization =====

export class OptimizePublishDto {
  @ApiProperty({ description: '平台' })
  @IsString()
  platform!: string;

  @ApiPropertyOptional({ description: '内容类型' })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiPropertyOptional({ description: '目标受众' })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiPropertyOptional({ description: '历史数据（JSON字符串）' })
  @IsOptional()
  @IsString()
  historicalData?: string;
}

// ===== Trend Prediction =====

export class PredictTrendDto {
  @ApiProperty({ enum: ['followers', 'likes', 'views', 'engagement'] })
  @IsEnum(['followers', 'likes', 'views', 'engagement'])
  metric!: string;

  @ApiPropertyOptional({ description: '平台' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '预测天数', default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({ description: '历史数据（JSON字符串）' })
  @IsOptional()
  @IsString()
  historicalData?: string;
}

// ===== Anomaly Detection =====

export class DetectAnomalyDto {
  @ApiPropertyOptional({ description: '数据集（JSON字符串）' })
  @IsOptional()
  @IsString()
  dataset?: string;

  @ApiPropertyOptional({ description: '指标类型' })
  @IsOptional()
  @IsString()
  metric?: string;

  @ApiPropertyOptional({ description: '平台' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '敏感度: low|medium|high', default: 'medium' })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  sensitivity?: 'low' | 'medium' | 'high';
}

// ===== Content Review =====

export class ReviewContentDto {
  @ApiProperty({ description: '待审核内容' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ description: '内容类型: text|title|caption' })
  @IsOptional()
  @IsString()
  contentType?: string;

  @ApiPropertyOptional({ description: '平台' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '严格程度: lenient|normal|strict', default: 'normal' })
  @IsOptional()
  @IsEnum(['lenient', 'normal', 'strict'])
  strictness?: 'lenient' | 'normal' | 'strict';
}
