import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthorizePlatformDto {
  @ApiProperty({ description: '平台标识', enum: ['DOUYIN', 'KUAISHOU', 'XIAOHONGSHU', 'WECHAT_VIDEO', 'BILIBILI', 'WEIBO'] })
  @IsString()
  platform!: string;

  @ApiPropertyOptional({ description: '团队ID' })
  @IsOptional()
  @IsString()
  teamId?: string;
}

export class CollectDataDto {
  @ApiProperty({ description: '账号ID' })
  @IsString()
  accountId!: string;

  @ApiPropertyOptional({ description: '数据类型', enum: ['account', 'content', 'daily'] })
  @IsOptional()
  @IsEnum(['account', 'content', 'daily'])
  type?: 'account' | 'content' | 'daily';
}

export class BatchCollectDto {
  @ApiProperty({ description: '账号ID列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  accountIds!: string[];

  @ApiPropertyOptional({ description: '数据类型', enum: ['account', 'content', 'daily'] })
  @IsOptional()
  @IsEnum(['account', 'content', 'daily'])
  type?: 'account' | 'content' | 'daily';
}

export class PlatformFilterDto {
  @ApiPropertyOptional({ description: '平台筛选' })
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional({ description: '团队ID' })
  @IsOptional()
  @IsString()
  teamId?: string;

  @ApiPropertyOptional({ description: '状态筛选' })
  @IsOptional()
  @IsString()
  status?: string;
}
