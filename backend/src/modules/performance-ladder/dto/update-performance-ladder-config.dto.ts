import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator'

export class UpdatePerformanceLadderConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyTarget?: number

  @IsOptional()
  @IsString()
  refundMode?: string

  @IsOptional()
  @IsString()
  sourceIgnoreMode?: string

  @IsOptional()
  @IsBoolean()
  hideUnmatched?: boolean

  @IsOptional()
  @IsObject()
  sourceOperators?: Record<string, string>

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceIgnoreList?: string[]
}
