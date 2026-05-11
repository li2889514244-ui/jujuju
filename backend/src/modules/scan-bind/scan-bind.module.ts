import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScanBindGateway } from './scan-bind.gateway';
import { ScanBindService } from './scan-bind.service';
import { UploaderModule } from '../uploader/uploader.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    UploaderModule,
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.expiresIn', '7d') },
      }),
    }),
  ],
  providers: [ScanBindGateway, ScanBindService],
  exports: [ScanBindService],
})
export class ScanBindModule {}
