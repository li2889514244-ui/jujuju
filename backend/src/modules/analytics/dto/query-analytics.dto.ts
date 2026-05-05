import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Platform } from '@prisma/client';

export class QueryAnalyticsDto {
  @ApiPropertyOptional({ description: '账号ID' })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiPropertyOptional({ description: '平台', enum: Platform })
  @IsOptional()
  @IsEnum(Platform)
  platform?: Platform;

  @ApiPropertyOptional({ description: '开始日期', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: '结束日期', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: '维度：day/week/month', example: 'day' })
  @IsOptional()
  @IsString()
  granularity?: 'day' | 'week' | 'month';
}
