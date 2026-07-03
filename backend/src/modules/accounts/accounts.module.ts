import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountGroupsController } from './account-groups.controller';
import { AccountsService } from './accounts.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { UploaderModule } from '../uploader/uploader.module';

@Module({
  imports: [PrismaModule, UploaderModule],
  controllers: [AccountsController, AccountGroupsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
