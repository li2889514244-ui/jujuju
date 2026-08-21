import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { ContentReviewService } from './content-review.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { IsString, IsOptional, MaxLength } from 'class-validator'

class ReviewDto {
  @IsString()
  @MaxLength(50000)
  content: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string
}

class QuickCheckDto {
  @IsString()
  @MaxLength(50000)
  text: string
}

@ApiTags('content-review')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('content-review')
export class ContentReviewController {
  constructor(private reviewService: ContentReviewService) {}

  /**
   * 完整内容审核（发布前调用）
   */
  @Post('review')
  async review(@Body() dto: ReviewDto) {
    return this.reviewService.review(dto.content, dto.title)
  }

  /**
   * 快速检测（编辑器实时调用，防抖后触发）
   */
  @Post('quick-check')
  async quickCheck(@Body() dto: QuickCheckDto) {
    return this.reviewService.quickCheck(dto.text)
  }
}
