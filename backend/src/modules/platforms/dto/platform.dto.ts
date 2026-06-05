import { IsString, IsOptional, IsEnum, IsArray, IsInt, Min, IsObject } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class AuthorizePlatformDto {
  @ApiProperty({
    description: '平台标识',
    enum: ['DOUYIN', 'KUAISHOU', 'XIAOHONGSHU', 'WECHAT_VIDEO', 'BILIBILI', 'WEIBO'],
  })
  @IsString()
  platform!: string

  @ApiPropertyOptional({ description: '团队ID' })
  @IsOptional()
  @IsString()
  teamId?: string
}

export class CollectDataDto {
  @ApiProperty({ description: '账号ID' })
  @IsString()
  accountId!: string

  @ApiPropertyOptional({ description: '数据类型', enum: ['account', 'content', 'daily'] })
  @IsOptional()
  @IsEnum(['account', 'content', 'daily'])
  type?: 'account' | 'content' | 'daily'
}

export class BatchCollectDto {
  @ApiProperty({ description: '账号ID列表', type: [String] })
  @IsArray()
  @IsString({ each: true })
  accountIds!: string[]

  @ApiPropertyOptional({ description: '数据类型', enum: ['account', 'content', 'daily'] })
  @IsOptional()
  @IsEnum(['account', 'content', 'daily'])
  type?: 'account' | 'content' | 'daily'
}

export class ReportMetricsDto {
  @ApiProperty({ description: '账号ID' })
  @IsString()
  accountId!: string

  @ApiProperty({ description: '指标数据' })
  @IsObject()
  metrics!: Record<string, any>

  @ApiPropertyOptional({ description: '指定日期 (YYYY-MM-DD)，默认今天' })
  @IsOptional()
  @IsString()
  date?: string
}

export class ReportPostStatItem {
  @ApiPropertyOptional({ description: '标题' })
  @IsOptional()
  @IsString()
  title?: string

  @ApiPropertyOptional({ description: '播放量' })
  @IsOptional()
  views?: number

  @ApiPropertyOptional({ description: '点赞数' })
  @IsOptional()
  likes?: number

  @ApiPropertyOptional({ description: '评论数' })
  @IsOptional()
  comments?: number

  @ApiPropertyOptional({ description: '分享数' })
  @IsOptional()
  shares?: number

  @ApiPropertyOptional({ description: '收藏数' })
  @IsOptional()
  saves?: number

  @ApiPropertyOptional({ description: '完播率(%)' })
  @IsOptional()
  completionRate?: number

  @ApiPropertyOptional({ description: '5秒完播率(%)' })
  @IsOptional()
  fiveSecCompletionRate?: number

  @ApiPropertyOptional({ description: '封面点击率(%)' })
  @IsOptional()
  coverClickRate?: number

  @ApiPropertyOptional({ description: '平均播放时长(秒)' })
  @IsOptional()
  avgPlayDuration?: number

  @ApiPropertyOptional({ description: '视频时长(秒)' })
  @IsOptional()
  videoDuration?: number

  @ApiPropertyOptional({ description: '弹幕数' })
  @IsOptional()
  danmakuCount?: number

  @ApiPropertyOptional({ description: '不喜欢数' })
  @IsOptional()
  dislikes?: number

  @ApiPropertyOptional({ description: '涨粉数' })
  @IsOptional()
  followsFromPost?: number

  @ApiPropertyOptional({ description: '封面图URL' })
  @IsOptional()
  @IsString()
  coverUrl?: string

  @ApiPropertyOptional({ description: '发布时间' })
  @IsOptional()
  @IsString()
  publishedAt?: string

  @ApiPropertyOptional({ description: '发布时间' })
  @IsOptional()
  @IsString()
  date?: string
}

export class ReportPostStatsDto {
  @ApiProperty({ description: '账号ID' })
  @IsString()
  accountId!: string

  @ApiProperty({ description: '帖子列表', type: [ReportPostStatItem] })
  @IsArray()
  posts!: ReportPostStatItem[]
}

export class PlatformFilterDto {
  @ApiPropertyOptional({ description: '平台筛选' })
  @IsOptional()
  @IsString()
  platform?: string

  @ApiPropertyOptional({ description: '团队ID' })
  @IsOptional()
  @IsString()
  teamId?: string

  @ApiPropertyOptional({ description: '状态筛选' })
  @IsOptional()
  @IsString()
  status?: string

  @ApiPropertyOptional({ description: '跳过条数', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number

  @ApiPropertyOptional({ description: '每页条数', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number
}
