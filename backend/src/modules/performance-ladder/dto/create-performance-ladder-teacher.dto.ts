import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator'

export class CreatePerformanceLadderTeacherDto {
  @IsString()
  name!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  aliases?: string[]

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyTarget?: number

  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number
}
