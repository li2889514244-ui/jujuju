import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Platform } from '../../common/prisma-enums';

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  async create(
    @Body() dto: CreateAccountDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.create(dto, userId);
  }

  @Get()
  @ApiQuery({ name: 'platform', required: false, enum: Platform })
  @ApiQuery({ name: 'teamId', required: false })
  @ApiQuery({ name: 'groupId', required: false })
  async findAll(
    @Query('platform') platform?: Platform,
    @Query('teamId') teamId?: string,
    @Query('groupId') groupId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser('id') userId?: string,
  ) {
    const pageNum = Math.max(1, Number(page) || 1);
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const skip = (pageNum - 1) * limitNum;
    return this.accountsService.findAll({ userId, teamId, groupId, platform, skip, take: limitNum });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.accountsService.findById(id);
  }

  @Get(':id/cookies')
  async getCookies(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.getCookies(id, userId);
  }

  @Put(':id')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.update(id, dto, userId);
  }

  @Put(':id/move-to-group')
  @HttpCode(HttpStatus.OK)
  async moveToGroup(
    @Param('id') id: string,
    @Body() body: { groupId: string | null },
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.moveToGroup(id, body.groupId, userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.accountsService.remove(id, userId);
  }
}
