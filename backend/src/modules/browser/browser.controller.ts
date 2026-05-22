import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BrowserService, BrowserInstance } from './browser.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/prisma-enums';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class CreateBrowserInstanceDto {
  @IsString()
  accountId: string;
}

@ApiTags('browser')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('browser')
export class BrowserController {
  constructor(private readonly browserService: BrowserService) {}

  @Get('instances')
  getInstances(): BrowserInstance[] {
    return this.browserService.getInstances();
  }

  @Post('instances')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  async createInstance(@Body() dto: CreateBrowserInstanceDto) {
    return this.browserService.createInstance(dto.accountId);
  }

  @Delete('instances/:id')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  async closeInstance(@Param('id') id: string) {
    await this.browserService.closeInstance(id);
    return { success: true };
  }
}
