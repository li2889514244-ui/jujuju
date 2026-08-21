import { ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class OwnershipHelper {
  static async assertOwnershipOrAdmin(
    prisma: PrismaService,
    userId: string,
    ownerId: string,
    entityName: string,
  ): Promise<void> {
    if (!userId || !ownerId) {
      throw new ForbiddenException(`无权访问该${entityName}`)
    }
    if (userId === ownerId) return

    const [user, owner] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, organizationId: true },
      }),
      prisma.user.findUnique({
        where: { id: ownerId },
        select: { organizationId: true },
      }),
    ])

    if (!user || !owner) {
      throw new ForbiddenException(`无权访问该${entityName}`)
    }
    if (user.role === 'SUPER_ADMIN') return
    if (user.organizationId && user.organizationId === owner.organizationId) return

    throw new ForbiddenException(`无权访问该${entityName}`)
  }
}
