import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTaskDto {
  @ApiProperty({ description: '老师/形象名称' })
  @IsString()
  @IsNotEmpty()
  teacher: string;

  @ApiProperty({ description: '文案内容（也是字幕内容）' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  text: string;
}

export class UpdateTaskDto {
  @ApiProperty({ description: '任务状态' })
  @IsString()
  status?: string;

  @ApiProperty({ description: '视频 OSS URL' })
  videoUrl?: string;

  @ApiProperty({ description: 'SRT字幕内容' })
  srtContent?: string;

  @ApiProperty({ description: '错误信息' })
  error?: string;
}
