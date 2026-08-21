import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class LoginDto {
  @ApiPropertyOptional({ description: 'Email or phone number', example: 'user@example.com' })
  @IsOptional()
  @IsString()
  @Matches(/^(\S+@\S+\.\S+|\+?\d[\d\s-]{5,20})$/, {
    message: '请输入邮箱或手机号',
  })
  identifier?: string

  @ApiPropertyOptional({
    description: 'Email address, kept for backward compatibility',
    example: 'user@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  email?: string

  @ApiProperty({ description: 'Password, at least 8 characters', example: 'Password123' })
  @IsString()
  @MinLength(8, { message: '密码长度不能少于8位' })
  password: string
}
