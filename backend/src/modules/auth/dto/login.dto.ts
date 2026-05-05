import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({ description: '密码', example: 'Password123!' })
  @IsString()
  @MinLength(6, { message: '密码长度不能少于6位' })
  password: string;
}
