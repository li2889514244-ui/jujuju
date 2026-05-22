import { IsString, IsOptional, IsArray, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContentDto {
  @ApiProperty({ description: '关联账号ID' })
  @IsString()
  accountId: string;

  @ApiPropertyOptional({ description: '标题', example: '我的第一个视频' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: '正文内容' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: '媒体文件URL列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mediaUrls?: string[];

  @ApiPropertyOptional({ description: '标签列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '定时发布时间', example: '2024-12-31T12:00:00Z' })
  @IsOptional()
  @IsDateString()
  publishAt?: string;
}
