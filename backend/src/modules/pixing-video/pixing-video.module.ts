import { Module } from '@nestjs/common';
import { PixingVideoController } from './pixing-video.controller';
import { PixingVideoService } from './pixing-video.service';

@Module({
  controllers: [PixingVideoController],
  providers: [PixingVideoService],
})
export class PixingVideoModule {}
