import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../../../common/prisma-enums';

export class CreateTeamDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  organizationId?: string;
}
