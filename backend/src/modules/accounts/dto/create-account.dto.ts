import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Platform } from '../../../common/prisma-enums';

export class CreateAccountDto {
  @IsEnum(Platform, { message: '[garbled]'})
  platform: Platform;

  @IsString()
  platformUserId: string;

  @IsString()
  nickname: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  cookies?: string;

  @IsOptional()
  @IsObject()
  proxyConfig?: Record<string, any>;

  @IsOptional()
  @IsString()
  teamId?: string;
}
