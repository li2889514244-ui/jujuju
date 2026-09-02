import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { PermissionService } from '../teams/permission.service'
import { UpdatePerformanceLadderConfigDto } from './dto/update-performance-ladder-config.dto'
import { CreatePerformanceLadderTeacherDto } from './dto/create-performance-ladder-teacher.dto'
import { UpdatePerformanceLadderTeacherDto } from './dto/update-performance-ladder-teacher.dto'
import { InitializePerformanceLadderDto } from './dto/initialize-performance-ladder.dto'

const DEFAULT_CONFIG = {
  monthlyTarget: 0,
  refundMode: 'include',
  sourceIgnoreMode: 'exclude',
  hideUnmatched: true,
  sourceOperators: {},
  sourceIgnoreList: [],
}

@Injectable()
export class PerformanceLadderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  private async getUserContext(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, organizationId: true, name: true },
    })
    if (!user?.organizationId) {
      throw new ForbiddenException('无组织访问权限')
    }
    return { ...user, organizationId: user.organizationId }
  }

  private parseJson<T>(value: unknown, fallback: T): T {
    if (!value) return fallback
    if (typeof value !== 'string') return value as T
    try {
      const parsed = JSON.parse(value)
      return parsed ?? fallback
    } catch {
      return fallback
    }
  }

  private stringify(value: unknown) {
    return JSON.stringify(value ?? null)
  }

  private static readonly MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

  /** 统一按北京时间计算当前自然月（YYYY-MM），避免服务器时区导致月初/月末跨月偏差 */
  protected currentYearMonth(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date())
    const year = parts.find((part) => part.type === 'year')?.value ?? ''
    const month = parts.find((part) => part.type === 'month')?.value ?? ''
    return `${year}-${month}`
  }

  /** 该自然月最后一秒的 unix 时间戳（秒） */
  private monthEndUnix(yearMonth: string): number {
    const [year, month] = yearMonth.split('-').map(Number)
    return Math.floor(Date.UTC(year, month, 0, 23, 59, 59, 999) / 1000)
  }

  private normalizeName(name: unknown) {
    const normalized = String(name || '').trim()
    if (!normalized) throw new BadRequestException('老师姓名不能为空')
    return normalized.slice(0, 80)
  }

  private normalizeStringArray(values: unknown, maxItems = 50) {
    return Array.isArray(values)
      ? values.map((value) => String(value || '').trim()).filter(Boolean).slice(0, maxItems)
      : []
  }

  private normalizeSourceOperators(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => [String(key || '').trim(), String(val || '').trim()] as const)
      .filter(([key, val]) => key && val)
      .slice(0, 1000)
    return Object.fromEntries(entries)
  }

  private normalizeConfigData(dto: UpdatePerformanceLadderConfigDto | InitializePerformanceLadderDto) {
    const data: any = {}
    if (dto.monthlyTarget !== undefined) data.monthlyTarget = Math.max(0, Math.round(dto.monthlyTarget))
    if (dto.refundMode !== undefined) data.refundMode = String(dto.refundMode || 'include').slice(0, 40)
    if (dto.sourceIgnoreMode !== undefined) data.sourceIgnoreMode = String(dto.sourceIgnoreMode || 'exclude').slice(0, 40)
    if (dto.hideUnmatched !== undefined) data.hideUnmatched = Boolean(dto.hideUnmatched)
    if (dto.sourceOperators !== undefined) data.sourceOperators = this.stringify(this.normalizeSourceOperators(dto.sourceOperators))
    if (dto.sourceIgnoreList !== undefined) data.sourceIgnoreList = this.stringify(this.normalizeStringArray(dto.sourceIgnoreList, 500))
    return data
  }

  private normalizeTeacherCreateData(
    organizationId: string,
    userId: string,
    teacher: CreatePerformanceLadderTeacherDto,
    fallbackSortOrder = 0,
  ) {
    return {
      id: `pltea_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      organizationId,
      name: this.normalizeName(teacher.name),
      aliases: this.stringify(this.normalizeStringArray(teacher.aliases)),
      monthlyTarget: Math.max(0, Math.round(teacher.monthlyTarget ?? 0)),
      enabled: teacher.enabled !== false,
      sortOrder: Math.max(0, Math.round(teacher.sortOrder ?? fallbackSortOrder)),
      updatedByUserId: userId,
    }
  }

  private toConfigDto(config: any, initialized: boolean, teachers: any[] = []) {
    const sourceOperators = this.parseJson<Record<string, string>>(config?.sourceOperators, {})
    const sourceIgnoreList = this.parseJson<string[]>(config?.sourceIgnoreList, [])
    return {
      initialized,
      config: {
        id: config?.id || null,
        monthlyTarget: config?.monthlyTarget ?? DEFAULT_CONFIG.monthlyTarget,
        refundMode: config?.refundMode ?? DEFAULT_CONFIG.refundMode,
        sourceIgnoreMode: config?.sourceIgnoreMode ?? DEFAULT_CONFIG.sourceIgnoreMode,
        hideUnmatched: config?.hideUnmatched ?? DEFAULT_CONFIG.hideUnmatched,
        sourceOperators,
        sourceIgnoreList,
        updatedAt: config?.updatedAt ?? null,
        updatedBy: config?.updatedByUser
          ? { id: config.updatedByUser.id, name: config.updatedByUser.name }
          : null,
      },
      teachers: teachers.map((teacher) => this.toTeacherDto(teacher)),
    }
  }

  private toTeacherDto(teacher: any) {
    return {
      id: teacher.id,
      name: teacher.name,
      aliases: this.parseJson<string[]>(teacher.aliases, []),
      monthlyTarget: teacher.monthlyTarget,
      enabled: teacher.enabled,
      sortOrder: teacher.sortOrder,
      updatedAt: teacher.updatedAt,
      updatedBy: teacher.updatedByUser
        ? { id: teacher.updatedByUser.id, name: teacher.updatedByUser.name }
        : null,
    }
  }

  private toSnapshotTarget(teacher: any) {
    return {
      id: teacher.id,
      name: teacher.name,
      aliases: this.parseJson<string[]>(teacher.aliases, []),
      monthlyTarget: teacher.monthlyTarget,
    }
  }

  /**
   * 月度快照响应。当前月返回实时配置（isCurrentMonth: true）；
   * 历史月返回冻结快照（首次读取时按当时配置创建）。
   */
  private toMonthSnapshotDto(
    yearMonth: string,
    isCurrentMonth: boolean,
    targets: any[],
    sourceOperators: Record<string, string>,
    hideUnmatched: boolean,
    capturedAt: string | Date | null,
    snapshotCreated: boolean,
  ) {
    return {
      yearMonth,
      isCurrentMonth,
      targets,
      sourceOperators,
      hideUnmatched,
      capturedAt: capturedAt ? new Date(capturedAt).toISOString() : null,
      snapshotCreated,
    }
  }

  async getConfig(userId: string) {
    const user = await this.getUserContext(userId)
    const [config, teachers] = await Promise.all([
      this.prisma.performanceLadderConfig.findUnique({
        where: { organizationId: user.organizationId },
        include: { updatedByUser: { select: { id: true, name: true } } },
      }),
      this.prisma.performanceLadderTeacher.findMany({
        where: { organizationId: user.organizationId },
        include: { updatedByUser: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ])
    return this.toConfigDto(config, Boolean(config || teachers.length), teachers)
  }

  /**
   * 查询某自然月的目标/规则快照。
   * - 当前月：直接返回实时配置（isCurrentMonth: true），不落库；
   * - 历史月：返回冻结快照；若从未生成过，则按“首次读取时”的配置创建快照，
   *   并排除该月结束后才创建的老师，避免新老师/新目标污染历史成绩。
   * - 未来月：拒绝。
   */
  async getMonthSnapshot(userId: string, month: string) {
    const user = await this.getUserContext(userId)
    const yearMonth = String(month || '').trim()
    if (!PerformanceLadderService.MONTH_PATTERN.test(yearMonth)) {
      throw new BadRequestException('月份格式不正确，应为 YYYY-MM')
    }
    const currentMonth = this.currentYearMonth()
    if (yearMonth > currentMonth) {
      throw new BadRequestException('不能查看未来月份')
    }

    const [config, teachers] = await Promise.all([
      this.prisma.performanceLadderConfig.findUnique({
        where: { organizationId: user.organizationId },
      }),
      this.prisma.performanceLadderTeacher.findMany({
        where: { organizationId: user.organizationId, enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ])

    if (yearMonth === currentMonth) {
      return this.toMonthSnapshotDto(
        yearMonth,
        true,
        teachers.map((teacher) => this.toSnapshotTarget(teacher)),
        this.parseJson<Record<string, string>>(config?.sourceOperators, {}),
        config?.hideUnmatched ?? DEFAULT_CONFIG.hideUnmatched,
        null,
        false,
      )
    }

    const existing = await this.prisma.performanceLadderMonthSnapshot.findUnique({
      where: { organizationId_yearMonth: { organizationId: user.organizationId, yearMonth } },
    })
    if (existing) {
      return this.toMonthSnapshotDto(
        yearMonth,
        false,
        this.parseJson<any[]>(existing.targets, []),
        this.parseJson<Record<string, string>>(existing.sourceOperators, {}),
        existing.hideUnmatched,
        existing.capturedAt,
        false,
      )
    }

    // 组织尚未初始化任何配置/老师：不落空快照，直接返回空结果
    if (!config && teachers.length === 0) {
      return this.toMonthSnapshotDto(yearMonth, false, [], {}, DEFAULT_CONFIG.hideUnmatched, null, false)
    }

    // 首次查看历史月：用当前配置创建快照，只纳入该月结束前已存在的老师
    const monthEnd = this.monthEndUnix(yearMonth)
    const monthTeachers = teachers.filter(
      (teacher) => Math.floor(teacher.createdAt.getTime() / 1000) <= monthEnd,
    )
    let snapshot: any
    try {
      snapshot = await this.prisma.performanceLadderMonthSnapshot.create({
        data: {
          id: `plms_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          organizationId: user.organizationId,
          yearMonth,
          targets: this.stringify(monthTeachers.map((teacher) => this.toSnapshotTarget(teacher))),
          sourceOperators: this.stringify(
            this.parseJson<Record<string, string>>(config?.sourceOperators, {}),
          ),
          hideUnmatched: config?.hideUnmatched ?? DEFAULT_CONFIG.hideUnmatched,
          capturedAt: new Date(),
        },
      })
    } catch (error: any) {
      // 并发竞态：两个标签页同时首次打开同一历史月，其中一个会触发唯一约束冲突。
      // 此时另一个请求已创建快照，直接读取并返回即可。
      if (error?.code !== 'P2002') throw error
      snapshot = await this.prisma.performanceLadderMonthSnapshot.findUnique({
        where: { organizationId_yearMonth: { organizationId: user.organizationId, yearMonth } },
      })
      if (snapshot) {
        return this.toMonthSnapshotDto(
          yearMonth,
          false,
          this.parseJson<any[]>(snapshot.targets, []),
          this.parseJson<Record<string, string>>(snapshot.sourceOperators, {}),
          snapshot.hideUnmatched,
          snapshot.capturedAt,
          false,
        )
      }
      throw error
    }
    return this.toMonthSnapshotDto(
      yearMonth,
      false,
      this.parseJson<any[]>(snapshot.targets, []),
      this.parseJson<Record<string, string>>(snapshot.sourceOperators, {}),
      snapshot.hideUnmatched,
      snapshot.capturedAt,
      true,
    )
  }

  /**
   * 配置/老师发生变更时，把当前自然月的最新目标与规则写入快照。
   * 这样当该月变为历史月后，仍能读到“当时生效”的目标值。
   */
  private async captureCurrentMonthSnapshot(organizationId: string) {
    const yearMonth = this.currentYearMonth()
    const [config, teachers] = await Promise.all([
      this.prisma.performanceLadderConfig.findUnique({ where: { organizationId } }),
      this.prisma.performanceLadderTeacher.findMany({
        where: { organizationId, enabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ])
    if (!config && teachers.length === 0) return
    const data = {
      targets: this.stringify(teachers.map((teacher) => this.toSnapshotTarget(teacher))),
      sourceOperators: this.stringify(
        this.parseJson<Record<string, string>>(config?.sourceOperators, {}),
      ),
      hideUnmatched: config?.hideUnmatched ?? DEFAULT_CONFIG.hideUnmatched,
      capturedAt: new Date(),
    }
    try {
      await this.prisma.performanceLadderMonthSnapshot.upsert({
        where: { organizationId_yearMonth: { organizationId, yearMonth } },
        update: data,
        create: {
          id: `plms_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          organizationId,
          yearMonth,
          ...data,
        },
      })
    } catch (error: any) {
      // upsert 与并发首次读取/其他写操作竞争时的唯一约束冲突：重试一次走 update 分支
      if (error?.code !== 'P2002') throw error
      await this.prisma.performanceLadderMonthSnapshot.update({
        where: { organizationId_yearMonth: { organizationId, yearMonth } },
        data,
      })
    }
  }

  async updateConfig(userId: string, dto: UpdatePerformanceLadderConfigDto) {
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')
    const user = await this.getUserContext(userId)
    const data: any = { ...this.normalizeConfigData(dto), updatedByUserId: user.id }

    const config = await this.prisma.performanceLadderConfig.upsert({
      where: { organizationId: user.organizationId },
      update: data,
      create: {
        id: `plcfg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        organizationId: user.organizationId,
        ...DEFAULT_CONFIG,
        sourceOperators: this.stringify(DEFAULT_CONFIG.sourceOperators),
        sourceIgnoreList: this.stringify(DEFAULT_CONFIG.sourceIgnoreList),
        ...data,
      },
      include: { updatedByUser: { select: { id: true, name: true } } },
    })
    const teachers = await this.prisma.performanceLadderTeacher.findMany({
      where: { organizationId: user.organizationId },
      include: { updatedByUser: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    await this.captureCurrentMonthSnapshot(user.organizationId)
    return this.toConfigDto(config, true, teachers)
  }

  async initializeConfig(userId: string, dto: InitializePerformanceLadderDto) {
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')
    const user = await this.getUserContext(userId)

    const existing = await this.prisma.performanceLadderConfig.findUnique({
      where: { organizationId: user.organizationId },
      include: { updatedByUser: { select: { id: true, name: true } } },
    })
    if (existing) {
      const teachers = await this.prisma.performanceLadderTeacher.findMany({
        where: { organizationId: user.organizationId },
        include: { updatedByUser: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
      return this.toConfigDto(existing, true, teachers)
    }

    const normalizedConfig = this.normalizeConfigData(dto)
    const teacherInputs = Array.isArray(dto.teachers) ? dto.teachers.slice(0, 50) : []
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const alreadyInitialized = await tx.performanceLadderConfig.findUnique({
          where: { organizationId: user.organizationId },
          include: { updatedByUser: { select: { id: true, name: true } } },
        })
        if (alreadyInitialized) return { config: alreadyInitialized, created: false }

        const config = await tx.performanceLadderConfig.create({
          data: {
            id: `plcfg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
            organizationId: user.organizationId,
            ...DEFAULT_CONFIG,
            sourceOperators: this.stringify(DEFAULT_CONFIG.sourceOperators),
            sourceIgnoreList: this.stringify(DEFAULT_CONFIG.sourceIgnoreList),
            ...normalizedConfig,
            updatedByUserId: user.id,
          },
          include: { updatedByUser: { select: { id: true, name: true } } },
        })

        if (teacherInputs.length > 0) {
          for (const [index, teacher] of teacherInputs.entries()) {
            await tx.performanceLadderTeacher.create({
              data: this.normalizeTeacherCreateData(user.organizationId, user.id, teacher, index),
            })
          }
        }

        return { config, created: true }
      })

      const teachers = await this.prisma.performanceLadderTeacher.findMany({
        where: { organizationId: user.organizationId },
        include: { updatedByUser: { select: { id: true, name: true } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      })
      if (result.created) await this.captureCurrentMonthSnapshot(user.organizationId)
      return this.toConfigDto(result.config, true, teachers)
    } catch (error: any) {
      if (error?.code === 'P2002') {
        return this.getConfig(userId)
      }
      throw error
    }
  }

  async getTeachers(userId: string) {
    const user = await this.getUserContext(userId)
    const teachers = await this.prisma.performanceLadderTeacher.findMany({
      where: { organizationId: user.organizationId },
      include: { updatedByUser: { select: { id: true, name: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
    return { teachers: teachers.map((teacher) => this.toTeacherDto(teacher)) }
  }

  async createTeacher(userId: string, dto: CreatePerformanceLadderTeacherDto) {
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')
    const user = await this.getUserContext(userId)
    const teacher = await this.prisma.performanceLadderTeacher.create({
      data: this.normalizeTeacherCreateData(user.organizationId, user.id, dto),
      include: { updatedByUser: { select: { id: true, name: true } } },
    })
    await this.captureCurrentMonthSnapshot(user.organizationId)
    return { teacher: this.toTeacherDto(teacher) }
  }

  async updateTeacher(userId: string, id: string, dto: UpdatePerformanceLadderTeacherDto) {
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')
    const user = await this.getUserContext(userId)
    const existing = await this.prisma.performanceLadderTeacher.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('老师不存在或已被删除')

    const data: any = { updatedByUserId: user.id }
    if (dto.name !== undefined) data.name = this.normalizeName(dto.name)
    if (dto.aliases !== undefined) data.aliases = this.stringify(this.normalizeStringArray(dto.aliases))
    if (dto.monthlyTarget !== undefined) data.monthlyTarget = Math.max(0, Math.round(dto.monthlyTarget))
    if (dto.enabled !== undefined) data.enabled = Boolean(dto.enabled)
    if (dto.sortOrder !== undefined) data.sortOrder = Math.max(0, Math.round(dto.sortOrder))

    const teacher = await this.prisma.performanceLadderTeacher.update({
      where: { id },
      data,
      include: { updatedByUser: { select: { id: true, name: true } } },
    })
    await this.captureCurrentMonthSnapshot(user.organizationId)
    return { teacher: this.toTeacherDto(teacher) }
  }

  async deleteTeacher(userId: string, id: string) {
    await this.permissionService.assertUserPermission(userId, 'manage_accounts')
    const user = await this.getUserContext(userId)
    const existing = await this.prisma.performanceLadderTeacher.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true },
    })
    if (!existing) throw new NotFoundException('老师不存在或已被删除')
    await this.prisma.performanceLadderTeacher.delete({ where: { id } })
    await this.captureCurrentMonthSnapshot(user.organizationId)
    return { success: true }
  }
}
