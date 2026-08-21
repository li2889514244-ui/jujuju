import { IsEmail, IsString, MinLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ description: '邮箱地址', example: 'user@example.com' })
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email: string;

  @ApiProperty({
    description: '密码（至少8位，包含大小写字母和数字）',
    example: 'SecurePass123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: '密码长度不能少于8位' })
  @Matches(/[A-Z]/, { message: '密码必须包含至少一个大写字母' })
  @Matches(/[a-z]/, { message: '密码必须包含至少一个小写字母' })
  @Matches(/[0-9]/, { message: '密码必须包含至少一个数字' })
  password: string;

  @ApiProperty({ description: '用户名', example: '张三' })
  @IsString()
  @MinLength(1, { message: '用户名不能为空' })
  name: string;

  @ApiPropertyOptional({ description: '手机号', example: '13800138000' })
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '请输入有效的手机号' })
  phone?: string;
}
