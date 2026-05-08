/**
 * TeamsService 单元测试
 * 测试团队服务的核心功能：创建团队、成员管理、权限控制
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { TeamsService } from '../../src/modules/teams/teams.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { mockPrismaService, resetPrismaMocks } from '../mocks/prisma.mock';
import { mockUsers, mockTeams, mockOrganizations } from '../fixtures';
import { Role } from '@prisma/client';

describe('TeamsService', () => {
  let service: TeamsService;

  beforeEach(async () => {
    resetPrismaMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ==================== 创建团队测试 ====================

  describe('create', () => {
    const createDto = { name: '新运营组' };

    it('应该成功创建团队', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      mockPrismaService.team.create.mockResolvedValue({
        ...mockTeams.teamA,
        ...createDto,
        id: 'team-new',
      });

      const result = await service.create(createDto, 'user-001');

      expect(result).toHaveProperty('id');
      expect(result.name).toBe(createDto.name);
      expect(mockPrismaService.team.create).toHaveBeenCalled();
    });

    it('应自动获取用户的组织 ID', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      mockPrismaService.team.create.mockResolvedValue(mockTeams.teamA);

      await service.create(createDto, 'user-001');

      const createCall = mockPrismaService.team.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe(mockUsers.regular.organizationId);
    });

    it('可以指定 organizationId 参数', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      mockPrismaService.team.create.mockResolvedValue(mockTeams.teamA);

      await service.create({ ...createDto, organizationId: 'org-002' }, 'user-001');

      const createCall = mockPrismaService.team.create.mock.calls[0][0];
      expect(createCall.data.organizationId).toBe('org-002');
    });

    it('用户无组织时应抛出 ForbiddenException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.noOrg);

      await expect(service.create(createDto, 'user-005')).rejects.toThrow(ForbiddenException);
      await expect(service.create(createDto, 'user-005')).rejects.toThrow('用户未加入任何组织');
    });

    it('创建的团队应关联到组织', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.regular);
      mockPrismaService.team.create.mockResolvedValue({
        ...mockTeams.teamA,
        organization: mockOrganizations.free,
      });

      const result = await service.create(createDto, 'user-001');

      expect(result).toHaveProperty('organization');
    });
  });

  // ==================== 查询团队测试 ====================

  describe('findAll', () => {
    it('应该返回团队列表', async () => {
      mockPrismaService.team.findMany.mockResolvedValue([
        mockTeams.teamA,
        mockTeams.teamB,
      ]);

      const result = await service.findAll('org-001');

      expect(result).toHaveLength(2);
      expect(mockPrismaService.team.findMany).toHaveBeenCalled();
    });

    it('可以不过滤组织 ID', async () => {
      mockPrismaService.team.findMany.mockResolvedValue([mockTeams.teamA]);

      await service.findAll();

      expect(mockPrismaService.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('应包含关联的账号信息', async () => {
      mockPrismaService.team.findMany.mockResolvedValue([mockTeams.teamA]);

      await service.findAll('org-001');

      expect(mockPrismaService.team.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            accounts: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('应该返回团队详情', async () => {
      mockPrismaService.team.findUnique.mockResolvedValue({
        ...mockTeams.teamA,
        accounts: [],
      });

      const result = await service.findById('team-001');

      expect(result).toHaveProperty('id', 'team-001');
      expect(result).toHaveProperty('name', '运营一组');
    });

    it('团队不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.team.findUnique.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
      await expect(service.findById('nonexistent')).rejects.toThrow('团队不存在');
    });

    it('应包含组织信息', async () => {
      mockPrismaService.team.findUnique.mockResolvedValue({
        ...mockTeams.teamA,
        organization: mockOrganizations.free,
        accounts: [],
      });

      const result = await service.findById('team-001');

      expect(result).toHaveProperty('organization');
    });
  });

  // ==================== 邀请成员测试 ====================

  describe('inviteMember', () => {
    const inviteDto = {
      email: 'newmember@example.com',
      role: Role.MEMBER,
    };

    it('管理员应能邀请新成员', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ ...mockUsers.regular, email: inviteDto.email }) // 查找被邀请人
        .mockResolvedValueOnce(mockUsers.admin); // 查找邀请人

      mockPrismaService.user.update.mockResolvedValue({
        ...mockUsers.regular,
        email: inviteDto.email,
        role: inviteDto.role,
        organization: mockOrganizations.free,
      });

      const result = await service.inviteMember(inviteDto, 'user-002');

      expect(result).toHaveProperty('email', inviteDto.email);
      expect(result).toHaveProperty('role', inviteDto.role);
    });

    it('被邀请人不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.inviteMember(inviteDto, 'user-002')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.inviteMember(inviteDto, 'user-002')).rejects.toThrow(
        '该邮箱未注册',
      );
    });

    it('邀请人无组织时应抛出 ForbiddenException', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ ...mockUsers.regular, email: inviteDto.email })
        .mockResolvedValueOnce(mockUsers.noOrg);

      await expect(service.inviteMember(inviteDto, 'user-005')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.inviteMember(inviteDto, 'user-005')).rejects.toThrow(
        '您未加入任何组织',
      );
    });

    it('权限不足的用户不能邀请成员', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ ...mockUsers.regular, email: inviteDto.email })
        .mockResolvedValueOnce({ ...mockUsers.regular, role: Role.VIEWER });

      await expect(service.inviteMember(inviteDto, 'user-001')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.inviteMember(inviteDto, 'user-001')).rejects.toThrow(
        '您没有邀请成员的权限',
      );
    });

    it('被邀请人已在同一组织时应抛出 ConflictException', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(mockUsers.regular) // 被邀请人已有相同组织
        .mockResolvedValueOnce(mockUsers.admin);

      await expect(service.inviteMember(inviteDto, 'user-002')).rejects.toThrow(
        ConflictException,
      );
      await expect(service.inviteMember(inviteDto, 'user-002')).rejects.toThrow(
        '该用户已在您的组织中',
      );
    });

    it('应正确设置被邀请人的角色', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ ...mockUsers.regular, email: inviteDto.email, organizationId: null })
        .mockResolvedValueOnce(mockUsers.admin);

      mockPrismaService.user.update.mockResolvedValue({
        ...mockUsers.regular,
        role: Role.MANAGER,
      });

      await service.inviteMember({ ...inviteDto, role: Role.MANAGER }, 'user-002');

      const updateCall = mockPrismaService.user.update.mock.calls[0][0];
      expect(updateCall.data.role).toBe(Role.MANAGER);
    });
  });

  // ==================== 更新成员角色测试 ====================

  describe('updateMemberRole', () => {
    it('管理员应能更新成员角色', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUsers.regular);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUsers.regular,
        role: Role.MANAGER,
      });

      const result = await service.updateMemberRole(
        'org-001',
        'user-001',
        Role.MANAGER,
        'user-002',
      );

      expect(result.role).toBe(Role.MANAGER);
    });

    it('不能修改自己的角色', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);

      await expect(
        service.updateMemberRole('org-001', 'user-002', Role.MEMBER, 'user-002'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.updateMemberRole('org-001', 'user-002', Role.MEMBER, 'user-002'),
      ).rejects.toThrow('不能修改自己的角色');
    });

    it('权限不足的用户不能修改角色', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUsers.regular,
        role: Role.MEMBER,
      });

      await expect(
        service.updateMemberRole('org-001', 'user-002', Role.MANAGER, 'user-001'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('成员不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.updateMemberRole('org-001', 'nonexistent', Role.MANAGER, 'user-002'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ==================== 移除成员测试 ====================

  describe('removeMember', () => {
    it('管理员应能移除成员', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUsers.regular);
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUsers.regular,
        organizationId: null,
        role: Role.MEMBER,
      });

      const result = await service.removeMember('org-001', 'user-001', 'user-002');

      expect(result.organizationId).toBeNull();
      expect(result.role).toBe(Role.MEMBER);
    });

    it('不能移除自己', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);

      await expect(
        service.removeMember('org-001', 'user-002', 'user-002'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.removeMember('org-001', 'user-002', 'user-002'),
      ).rejects.toThrow('不能移除自己');
    });

    it('不能移除组织所有者', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUsers.owner);

      await expect(
        service.removeMember('org-001', 'user-003', 'user-002'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.removeMember('org-001', 'user-003', 'user-002'),
      ).rejects.toThrow('不能移除组织所有者');
    });

    it('成员不存在时应抛出 NotFoundException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.removeMember('org-001', 'nonexistent', 'user-002'),
      ).rejects.toThrow(NotFoundException);
    });

    it('移除后成员角色应重置为 MEMBER', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUsers.admin);
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUsers.regular,
        role: Role.MANAGER,
      });
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUsers.regular,
        role: Role.MEMBER,
      });

      await service.removeMember('org-001', 'user-001', 'user-002');

      const updateCall = mockPrismaService.user.update.mock.calls[0][0];
      expect(updateCall.data.role).toBe(Role.MEMBER);
      expect(updateCall.data.organizationId).toBeNull();
    });
  });

  // ==================== 获取成员列表测试 ====================

  describe('getMembers', () => {
    it('应该返回组织成员列表', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([
        mockUsers.owner,
        mockUsers.admin,
        mockUsers.regular,
      ]);

      const result = await service.getMembers('org-001');

      expect(result).toHaveLength(3);
      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-001' },
        }),
      );
    });

    it('返回的成员信息应包含必要字段', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUsers.regular]);

      await service.getMembers('org-001');

      const findCall = mockPrismaService.user.findMany.mock.calls[0][0];
      expect(findCall.select).toHaveProperty('id');
      expect(findCall.select).toHaveProperty('email');
      expect(findCall.select).toHaveProperty('name');
      expect(findCall.select).toHaveProperty('role');
      expect(findCall.select).toHaveProperty('status');
    });
  });
});
