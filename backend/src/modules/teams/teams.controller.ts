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
} from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/prisma-enums';

@ApiTags('teams')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  async create(@Body() dto: CreateTeamDto, @CurrentUser('id') userId: string) {
    return this.teamsService.create(dto, userId);
  }

  @Get()
  async findAll(@Query('organizationId') organizationId?: string) {
    return this.teamsService.findAll(organizationId);
  }

  // Members routes must come BEFORE :id route to avoid route conflicts
  @Get('members')
  async getMembers(@CurrentUser('organizationId') orgId: string) {
    return this.teamsService.getMembers(orgId);
  }

  @Post('members/invite')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async inviteMember(
    @Body() dto: InviteMemberDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.teamsService.inviteMember(dto, userId);
  }

  @Put('members/:memberId/role')
  @Roles(Role.OWNER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async updateMemberRole(
    @Param('memberId') memberId: string,
    @Body('role') role: Role,
    @CurrentUser('id') userId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.teamsService.updateMemberRole(orgId, memberId, role, userId);
  }

  @Delete('members/:memberId')
  @Roles(Role.OWNER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @Param('memberId') memberId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.teamsService.removeMember(orgId, memberId, userId);
  }

  // :id route comes AFTER members routes
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }
}
