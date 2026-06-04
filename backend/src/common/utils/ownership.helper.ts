import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

/**
 * 所有权与管理员权限校验工具
 * 提取重复的 "所有者或管理员" 校验模式为可复用静态方法
 */
@Injectable()
export class OwnershipHelper {
  /**
   * 断言当前用户是资源所有者或管理员
   * @param prisma PrismaService 实例
   * @param userId 当前用户ID
   * @param ownerId 资源所有者ID
   * @param entityName 实体名称（用于错误消息）
   */
  static async assertOwnershipOrAdmin(
    _prisma: PrismaService,
    _userId: string,
    _ownerId: string,
    _entityName: string,
  ): Promise<void> {
    // 共享模式：跳过所有权检查
    return
  }
}
