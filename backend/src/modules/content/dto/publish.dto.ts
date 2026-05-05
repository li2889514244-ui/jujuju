import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublishDto {
  @ApiProperty({ description: '内容ID' })
  @IsString()
  contentId: string;

  @ApiPropertyOptional({ description: '是否立即发布（忽略定时）' })
  @IsOptional()
  immediate?: boolean;
}
