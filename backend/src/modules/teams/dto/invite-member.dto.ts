import { IsString, IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../../common/prisma-enums';

export class InviteMemberDto {
  @IsEmail({}, { message: '' })
  email: string;

  @IsEnum(Role, { message: '[garbled]'})
  role: Role;
}
