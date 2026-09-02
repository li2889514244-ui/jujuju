import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator'
import { CreatePerformanceLadderTeacherDto } from './create-performance-ladder-teacher.dto'

export class InitializePerformanceLadderDto {
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePerformanceLadderTeacherDto)
  teachers?: CreatePerformanceLadderTeacherDto[]
}
