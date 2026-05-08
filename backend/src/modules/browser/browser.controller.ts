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
import { Role } from '@prisma/client';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class CreateBrowserInstanceDto {
  @ApiProperty({ description: '关联账号ID' })
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
  @ApiOperation({ summary: '获取浏览器实例列表' })
  getInstances(): BrowserInstance[] {
    return this.browserService.getInstances();
  }

  @Post('instances')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '创建浏览器实例' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async createInstance(@Body() dto: CreateBrowserInstanceDto) {
    return this.browserService.createInstance(dto.accountId);
  }

  @Delete('instances/:id')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '关闭浏览器实例' })
  async closeInstance(@Param('id') id: string) {
    await this.browserService.closeInstance(id);
    return { success: true };
  }
}
