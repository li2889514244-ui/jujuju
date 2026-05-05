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
import { Role } from '@prisma/client';

@ApiTags('teams')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: '创建团队' })
  @ApiResponse({ status: 201, description: '创建成功' })
  async create(@Body() dto: CreateTeamDto, @CurrentUser('id') userId: string) {
    return this.teamsService.create(dto, userId);
  }

  @Get()
  @ApiOperation({ summary: '获取团队列表' })
  async findAll(@Query('organizationId') organizationId?: string) {
    return this.teamsService.findAll(organizationId);
  }

  // Members routes must come BEFORE :id route to avoid route conflicts
  @Get('members')
  @ApiOperation({ summary: '获取当前组织成员列表' })
  async getMembers(@CurrentUser('organizationId') orgId: string) {
    return this.teamsService.getMembers(orgId);
  }

  @Post('members/invite')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '邀请成员' })
  @ApiResponse({ status: 201, description: '邀请成功' })
  @ApiResponse({ status: 404, description: '邮箱未注册' })
  @ApiResponse({ status: 409, description: '用户已在组织中' })
  async inviteMember(
    @Body() dto: InviteMemberDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.teamsService.inviteMember(dto, userId);
  }

  @Put('members/:memberId/role')
  @Roles(Role.OWNER, Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '更新成员角色' })
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
  @ApiOperation({ summary: '移除成员' })
  @ApiResponse({ status: 403, description: '无权限操作' })
  async removeMember(
    @Param('memberId') memberId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return this.teamsService.removeMember(orgId, memberId, userId);
  }

  // :id route comes AFTER members routes
  @Get(':id')
  @ApiOperation({ summary: '获取团队详情' })
  @ApiResponse({ status: 404, description: '团队不存在' })
  async findOne(@Param('id') id: string) {
    return this.teamsService.findById(id);
  }
}
