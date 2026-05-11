import { Module, forwardRef } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploaderModule } from '../uploader/uploader.module';

@Module({
  impo