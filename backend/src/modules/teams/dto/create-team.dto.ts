import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class CreateTeamDto {
  @ApiProperty({ description: '团队名称', example: '运营一组' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '组织ID（不传则使用当前用户的组织）' })
  @IsOptional()
  @IsString()
  organizationId?: string;
}
