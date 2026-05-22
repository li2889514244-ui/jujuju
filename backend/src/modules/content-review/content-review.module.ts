import { Module } from '@nestjs/common';
import { ContentReviewService } from './content-review.service';
import { ContentReviewController } from './content-review.controller';

@Module({
  providers: [ContentReviewService],
  controllers: [ContentReviewController],
  exports: [ContentReviewService],
})
export class ContentReviewModule {}
