import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { Role } from '../../common/prisma-enums';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 鍒涘缓鍥㈤槦
   */
  async create(dto: CreateTeamDto, userId: string) {
    // 鑾峰彇鐢ㄦ埛鐨勭粍缁嘔D
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });

    const organizationId = dto.organizationId || user?.organizationId;
    if (!organizationId) {
      throw new ForbiddenException('');
    }

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        organizationId,
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(`鍥㈤槦鍒涘缓鎴愬姛: ${team.name} (${team.id})`);
    return team;
  }

  /**
   * 鑾峰彇鍥㈤槦鍒楄〃
   */
  async findAll(organizationId?: string) {
    const where = organizationId ? { organizationId } : {};
    return this.prisma.team.findMany({
      where,
      include: {
        organization: {
          select: { id: true, name: true },
        },
        accounts: {
          select: {
            id: true,
            platform: true,
            nickname: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 鑾峰彇鍥㈤槦璇︽儏
   */
  async findById(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: {
        organization: {
          select: { id: true, name: true, plan: true },
        },
        accounts: {
          select: {
            id: true,
            platform: true,
            nickname: true,
            avatar: true,
            followers: true,
            status: true,
            owner: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('[garbled]');
    }

    return team;
  }

  /**
   * 閭€璇锋垚鍛樺埌缁勭粐
   */
  async inviteMember(dto: InviteMemberDto, inviterId: string) {
    // 鏌ユ壘琚個璇蜂汉
    const invitee = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!invitee) {
      throw new NotFoundException('[garbled]');
    }

    // 鑾峰彇閭€璇蜂汉鐨勭粍缁?
    const inviter = await this.prisma.user.findUnique({
      where: { id: inviterId },
      select: { organizationId: true, role: true },
    });

    if (!inviter?.organizationId) {
      throw new ForbiddenException('');
    }

    // 妫€鏌ユ潈闄愶細鍙湁 OWNER銆丄DMIN銆丮ANAGER 鍙互閭€璇?
    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(inviter.role)) {
      throw new ForbiddenException('');
    }

    // 妫€鏌ヨ閭€璇蜂汉鏄惁宸插湪鍚屼竴缁勭粐
    if (invitee.organizationId === inviter.organizationId) {
      throw new ConflictException('');
    }

    // 灏嗚閭€璇蜂汉鍔犲叆缁勭粐骞惰缃鑹?
    const updatedUser = await this.prisma.user.update({
      where: { id: invitee.id },
      data: {
        organizationId: inviter.organizationId,
        role: dto.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    this.logger.log(
      `鎴愬憳閭€璇锋垚鍔? ${dto.email} 鍔犲叆缁勭粐 ${inviter.organizationId}锛岃鑹? ${dto.role}`,
    );

    return updatedUser;
  }

  /**
   * 鏇存柊鎴愬憳瑙掕壊
   * #6 淇: 鏍￠獙涓嶈兘璁剧疆姣旇嚜宸辨洿楂樼殑瑙掕壊
   */
  async updateMemberRole(
    organizationId: string,
    memberId: string,
    newRole: Role,
    operatorId: string,
  ) {
    // 楠岃瘉鎿嶄綔鑰呮潈闄?
    const operator = await this.prisma.user.findUnique({
      where: { id: operatorId },
    });

    if (!operator || !['OWNER', 'ADMIN'].includes(operator.role)) {
      throw new ForbiddenException('');
    }

    // 涓嶈兘淇敼鑷繁鐨勮鑹?
    if (memberId === operatorId) {
      throw new ForbiddenException('[garbled]');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('[garbled]');
    }

    // #6 淇: 瑙掕壊绛夌骇鏍￠獙 鈥?涓嶈兘璁剧疆姣旇嚜宸辨洿楂樼殑瑙掕壊
    const roleHierarchy: Record<string, number> = {
      OWNER: 5,
      ADMIN: 4,
      MANAGER: 3,
      MEMBER: 2,
      VIEWER: 1,
    };
    const operatorLevel = roleHierarchy[operator.role] || 0;
    const targetLevel = roleHierarchy[newRole] || 0;
    if (targetLevel >= operatorLevel) {
      throw new ForbiddenException('[garbled]');
    }

    return this.prisma.user.update({
      where: { id: memberId },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });
  }

  /**
   * 绉婚櫎鎴愬憳锛堜粠缁勭粐涓Щ闄わ級
   */
  async removeMember(
    organizationId: string,
    memberId: string,
    operatorId: string,
  ) {
    const operator = await this.prisma.user.findUnique({
      where: { id: operatorId },
    });

    if (!operator || !['OWNER', 'ADMIN'].includes(operator.role)) {
      throw new ForbiddenException('');
    }

    if (memberId === operatorId) {
      throw new ForbiddenException('');
    }

    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('[garbled]');
    }

    if (member.role === 'OWNER') {
      throw new ForbiddenException('[garbled]');
    }

    return this.prisma.user.update({
      where: { id: memberId },
      data: {
        organizationId: null,
        role: 'MEMBER',
      },
    });
  }

  /**
   * 鑾峰彇缁勭粐鎴愬憳鍒楄〃
   */
  async getMembers(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
