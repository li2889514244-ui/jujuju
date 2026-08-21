import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class GetOrderListDto {
  @ApiPropertyOptional({ description: '单页数量，不超过10', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10)
  page_size?: number = 10

  @ApiPropertyOptional({ description: '翻页上下文' })
  @IsOptional()
  @IsString()
  next_key?: string

  @ApiPropertyOptional({ description: '订单ID过滤' })
  @IsOptional()
  @IsString()
  order_id?: string
}

export class GetOrderDetailDto {
  @ApiPropertyOptional({ description: '订单号' })
  @IsString()
  order_id!: string

  @ApiPropertyOptional({ description: '商品SKU ID' })
  @IsString()
  sku_id!: string

  @ApiPropertyOptional({ description: '订单额外参数' })
  @IsOptional()
  @IsString()
  special_id?: string
}
