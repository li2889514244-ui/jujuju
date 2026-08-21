import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Platform } from '../../../common/prisma-enums';

export function normalizeAccountText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    const text = value.trim()
    return text === '[object Object]' ? fallback : text
  }
  if (value === null || value === undefined) return fallback
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of [
      'nickname',
      'name',
      'displayName',
      'username',
      'platformUserId',
      'id',
      'avatarUrl',
      'avatar_url',
      'headImgUrl',
      'head_img_url',
      'url',
      'src',
    ]) {
      const candidate = obj[key]
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
      if (typeof candidate === 'number' || typeof candidate === 'boolean') return String(candidate)
    }
  }
  return fallback
}

export class CreateAccountDto {
  @IsEnum(Platform, { message: 'platform must be a supported platform' })
  platform: Platform;

  @IsString()
  @Transform(({ obj, value }) => normalizeAccountText(obj?.platformUserId, normalizeAccountText(value)))
  platformUserId: string;

  @IsString()
  @Transform(({ obj, value }) =>
    normalizeAccountText(obj?.nickname, normalizeAccountText(value, normalizeAccountText(obj?.platformUserId, '未命名账号'))),
  )
  nickname: string;

  @IsOptional()
  @IsString()
  @Transform(({ obj, value }) => normalizeAccountText(obj?.avatar, normalizeAccountText(value)))
  avatar?: string;

  @IsOptional()
  @IsString()
  @Transform(({ obj, value }) => normalizeAccountText(obj?.bio, normalizeAccountText(value)))
  bio?: string;

  @IsOptional()
  @IsString()
  @Transform(({ obj, value }) => normalizeAccountText(obj?.cookies, normalizeAccountText(value)))
  cookies?: string;

  @IsOptional()
  @IsObject()
  proxyConfig?: Record<string, any>;

  @IsOptional()
  @IsString()
  teamId?: string;
}
