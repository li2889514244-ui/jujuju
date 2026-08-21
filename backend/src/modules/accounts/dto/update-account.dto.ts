import { IsString, IsEnum, IsOptional, IsObject, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { AccountStatus } from '@prisma/client';
import { normalizeAccountText } from './create-account.dto';

function normalizeOptionalAccountText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return normalizeAccountText(value);
}

export class UpdateAccountDto {
  @ApiPropertyOptional({ description: '昵称' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalAccountText(value))
  nickname?: string;

  @ApiPropertyOptional({ description: '头像URL' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalAccountText(value))
  avatar?: string;

  @ApiPropertyOptional({ description: '简介' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalAccountText(value))
  bio?: string;

  @ApiPropertyOptional({ description: 'Cookie（将加密存储）' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalAccountText(value))
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

  @ApiPropertyOptional({ description: '获赞数' })
  @IsOptional()
  @IsInt()
  likes?: number;

  @ApiPropertyOptional({ description: '关注数' })
  @IsOptional()
  @IsInt()
  following?: number;

  @ApiPropertyOptional({ description: '团队ID' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => normalizeOptionalAccountText(value))
  teamId?: string;
}
