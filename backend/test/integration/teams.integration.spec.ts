/**
 * Teams 集成测试
 * 测试团队协作 API 的端到端交互
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { TeamsService } from '../../src/modules/teams/teams.service';
import { TeamsController } from '../../src/modules/teams/teams.controller';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockUsers, mockTeams, mockOrganizations } from '../fixtures';
import { Role } from '@prisma/client';

describe('Teams 集成测试', () => {
  let teamsService: TeamsService;
  let teamsController: TeamsController;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    teamsService = module.get<TeamsService>(TeamsService);
    teamsController = module.get<TeamsController>(TeamsController);
  });

  beforeEach(() => {
    resetPrismaMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 创建团队 API 测试 ====================

  describe('POST /teams', () => {
    it('应通过 Controller 创建团队', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      mockPrismaService.team.create.mockResolvedValue({
        ...mockTeams.teamA,
        id: 'team-new',
        name: '新团队',
      });

      // Controller 签名: create(dto, userId)
      const result = await teamsController.create(
        { name: '新团队' },
        'user-001', // @CurrentUser('id')
      );

      expect(result).toHaveProperty('id');
      expect(result.name).toBe('新团队');
    });

    it('无组织的用户不能创建团队', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.noOrg);

      await expect(
        teamsController.create({ name: '新团队' }, 'user-005'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ==================== 查询团队 API 测试 ====================

  describe('GET /teams', () => {
    it('应返回团队列表', async () => {
      mockPrismaService.team.findMany.mockResolvedValue([
        mockTeams.teamA,
        mockTeams.teamB,
      ]);

      // Controller 签名: findAll(organizationId?)
      const result = await teamsController.findAll('org-001');

      expect(result).toHaveLength(2);
    });
  });

  describe('GET /teams/:id', () => {
    it('应返回团队详情', async () => {
      mockPrismaService.team.findUnique.mockResolvedValue({
        ...mockTeams.teamA,
        accounts: [],
      });

      const result = await teamsController.findOne('team-001');

      expect(result).toHaveProperty('id', 'team-001');
    });

    it('团队不存在时应返回 404', async () => {
      mockPrismaService.team.findUnique.mockResolvedValue(null);

      await expect(teamsController.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ==================== 成员管理 API 测试 ====================

  describe('成员管理', () => {
    describe('邀请成员', () => {
      it('应成功邀请新成员', async () => {
        mockPrismaService.user.findUnique
          .mockResolvedValueOnce({ ...mockUsers.regular, email: 'new@example.com', organizationId: null })
          .mockResolvedValueOnce(mockUsers.admin);

        mockPrismaService.user.update.mockResolvedValue({
          ...mockUsers.regular,
          email: 'new@example.com',
          role: Role.MEMBER,
          organization: mockOrganizations.free,
        });

        // Controller 签名: inviteMember(dto, userId)
        const result = await teamsController.inviteMember(
          { email: 'new@example.com', role: Role.MEMBER },
          'user-002', // @CurrentUser('id')
        );

        expect(result).toHaveProperty('email', 'new@example.com');
      });

      it('权限不足时应返回 403', async () => {
        mockPrismaService.user.findUnique
          .mockResolvedValueOnce({ ...mockUsers.regular, email: 'new@example.com' })
          .mockResolvedValueOnce({ ...mockUsers.regular, role: Role.VIEWER });

        await expect(
          teamsController.inviteMember(
            { email: 'new@example.com', role: Role.MEMBER },
            'user-001',
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('更新成员角色', () => {
      it('管理员应能更新成员角色', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
        mockPrismaService.user.findFirst.mockResolvedValue(mockUsers.regular);
        mockPrismaService.user.update.mockResolvedValue({
          ...mockUsers.regular,
          role: Role.MANAGER,
        });

        // Controller 签名: updateMemberRole(memberId, role, userId, orgId)
        const result = await teamsController.updateMemberRole(
          'user-001',   // memberId
          Role.MANAGER,  // role (from @Body('role'))
          'user-002',   // userId
          'org-001',    // orgId
        );

        expect(result.role).toBe(Role.MANAGER);
      });
    });

    describe('移除成员', () => {
      it('管理员应能移除成员', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
        mockPrismaService.user.findFirst.mockResolvedValue(mockUsers.regular);
        mockPrismaService.user.update.mockResolvedValue({
          ...mockUsers.regular,
          organizationId: null,
          role: Role.MEMBER,
        });

        // Controller 签名: removeMember(memberId, userId, orgId)
        const result = await teamsController.removeMember(
          'user-001', // memberId
          'user-002', // userId
          'org-001',  // orgId
        );

        expect(result.organizationId).toBeNull();
      });

      it('不能移除自己', async () => {
        mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);

        await expect(
          teamsController.removeMember('user-002', 'user-002', 'org-001'),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('获取成员列表', () => {
      it('应返回组织成员列表', async () => {
        mockPrismaService.user.findMany.mockResolvedValue([
          mockUsers.owner,
          mockUsers.admin,
          mockUsers.regular,
        ]);

        // Controller 签名: getMembers(orgId)
        const result = await teamsController.getMembers('org-001');

        expect(result).toHaveLength(3);
      });
    });
  });

  // ==================== 团队协作流程测试 ====================

  describe('团队协作完整流程', () => {
    it('应支持 创建团队 -> 邀请成员 -> 管理角色 -> 移除成员 的完整流程', async () => {
      // 1. 创建团队
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.team.create.mockResolvedValue({
        ...mockTeams.teamA,
        id: 'team-flow',
        name: '流程测试团队',
      });

      const team = await teamsService.create({ name: '流程测试团队' }, 'user-002');
      expect(team.id).toBe('team-flow');

      // 2. 邀请成员
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ ...mockUsers.regular, email: 'member@example.com', organizationId: null })
        .mockResolvedValueOnce(mockUsers.admin);

      mockPrismaService.user.update.mockResolvedValue({
        ...mockUsers.regular,
        role: Role.MEMBER,
      });

      const member = await teamsService.inviteMember(
        { email: 'member@example.com', role: Role.MEMBER },
        'user-002',
      );
      expect(member.role).toBe(Role.MEMBER);

      // 3. 更新角色
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUsers.regular);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUsers.regular,
        role: Role.MANAGER,
      });

      const updated = await teamsService.updateMemberRole(
        'org-001',
        'user-001',
        Role.MANAGER,
        'user-002',
      );
      expect(updated.role).toBe(Role.MANAGER);

      // 4. 移除成员
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUsers.regular,
        role: Role.MANAGER,
      });
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUsers.regular,
        organizationId: null,
        role: Role.MEMBER,
      });

      const removed = await teamsService.removeMember('org-001', 'user-001', 'user-002');
      expect(removed.organizationId).toBeNull();
    });
  });
});
