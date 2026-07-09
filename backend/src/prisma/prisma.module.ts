import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantModule } from '../common/tenant/tenant.module';

@Global()
@Module({
  imports: [TenantModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
