import { IsString, IsEnum, IsOptional, IsObject, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '@prisma/client';

export class UpdateAccountDto {
  @ApiPropertyOptional({ description: '昵称' })
  @IsOptional()
  @IsString()
  nickname?: string;

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

  @ApiPropertyOptional({ description: '账号状态', enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ description: '粉丝数' })
  @IsOptional()
  @IsInt()
  followers?: number;

  @ApiPropertyOptional({ description: '关注数' })
  @IsOptional()
  @IsInt()
  following?: number;

  @ApiPropertyOptional({ description: '团队ID' })
  @IsOptional()
  @IsString()
  teamId?: string;
}
