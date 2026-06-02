import { IsOptional, IsNumber, Min, Max } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class GetProductListDto {
  @ApiPropertyOptional({ description: '单页数量，不超过500', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  page_size?: number = 20

  @ApiPropertyOptional({ description: '页面下标，从1开始' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page_index?: number

  @ApiPropertyOptional({ description: '翻页上下文（与page_index二选一）' })
  @IsOptional()
  @Type(() => String)
  last_buffer?: string
}
