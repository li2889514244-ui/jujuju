import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Platform } from '@prisma/client';

export class CreateAccountDto {
  @ApiProperty({ description: '平台', enum: Platform, example: Platform.DOUYIN })
  @IsEnum(Platform, { message: '无效的平台类型' })
  platform: Platform;

  @ApiProperty({ description: '平台用户ID', example: 'user_123456' })
  @IsString()
  platformUserId: string;

  @ApiProperty({ description: '昵称', example: '我的抖音号' })
  @IsString()
  nickname: string;

  @ApiPropertyOptional({ description: '头像URL' })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiPropertyOptional({ description: '简介' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Cookie（将加密存储）' })
  @IsOptional()
  @IsString()
  cookies?: string;

  @ApiPropertyOptional({ description: '代理配置' })
  @IsOptional()
  @IsObject()
  proxyConfig?: Record<string, any>;

  @ApiPropertyOptional({ description: '团队ID' })
  @IsOptional()
  @IsString()
  teamId?: string;
}
