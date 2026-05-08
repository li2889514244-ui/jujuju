import { IsString, IsEmail, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class InviteMemberDto {
  @ApiProperty({ description: '被邀请人邮箱', example: 'member@example.com' })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({ description: '角色', enum: Role, example: Role.MEMBER })
  @IsEnum(Role, { message: '无效的角色类型' })
  role: Role;
}
