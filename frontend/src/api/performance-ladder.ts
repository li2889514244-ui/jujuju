import { del, get, patch, post, put } from './request'

export interface PerformanceLadderTeacherDto {
  id: string
  name: string
  aliases: string[]
  monthlyTarget: number
  enabled: boolean
  sortOrder: number
  updatedAt?: string | null
  updatedBy?: { id: string; name: string } | null
}

export interface PerformanceLadderConfigDto {
  id: string | null
  monthlyTarget: number
  refundMode: string
  sourceIgnoreMode: string
  hideUnmatched: boolean
  sourceOperators: Record<string, string>
  sourceIgnoreList: string[]
  updatedAt?: string | null
  updatedBy?: { id: string; name: string } | null
}

export interface PerformanceLadderConfigResponse {
  initialized: boolean
  config: PerformanceLadderConfigDto
  teachers: PerformanceLadderTeacherDto[]
}

/** 某自然月当时生效的目标/归因规则快照 */
export interface PerformanceLadderMonthSnapshotResponse {
  yearMonth: string
  isCurrentMonth: boolean
  targets: Array<{
    id: string
    name: string
    aliases: string[]
    monthlyTarget: number
  }>
  sourceOperators: Record<string, string>
  hideUnmatched: boolean
  /** 历史月快照创建时间；当前月为 null */
  capturedAt: string | null
  /** 本次读取是否为首次生成快照（此前从未保存过该月） */
  snapshotCreated: boolean
}

export interface SavePerformanceLadderConfigPayload {
  monthlyTarget?: number
  refundMode?: string
  sourceIgnoreMode?: string
  hideUnmatched?: boolean
  sourceOperators?: Record<string, string>
  sourceIgnoreList?: string[]
}

export interface SavePerformanceLadderTeacherPayload {
  name: string
  aliases?: string[]
  monthlyTarget?: number
  enabled?: boolean
  sortOrder?: number
}

export interface InitializePerformanceLadderPayload extends SavePerformanceLadderConfigPayload {
  teachers?: SavePerformanceLadderTeacherPayload[]
}

export const performanceLadderApi = {
  getConfig() {
    return get<PerformanceLadderConfigResponse>('/performance-ladder/config')
  },

  /** 获取某自然月当时生效的目标/归因规则快照（当前月返回实时配置） */
  getMonthSnapshot(month: string) {
    return get<PerformanceLadderMonthSnapshotResponse>(
      `/performance-ladder/month-snapshot/${month}`,
      undefined,
      { silent: true } as any,
    )
  },

  updateConfig(data: SavePerformanceLadderConfigPayload) {
    return put<PerformanceLadderConfigResponse>('/performance-ladder/config', data)
  },

  initializeConfig(data: InitializePerformanceLadderPayload) {
    return post<PerformanceLadderConfigResponse>('/performance-ladder/config/initialize', data)
  },

  getTeachers() {
    return get<{ teachers: PerformanceLadderTeacherDto[] }>('/performance-ladder/teachers')
  },

  createTeacher(data: SavePerformanceLadderTeacherPayload) {
    // silent：错误提示由调用方用中文统一处理，避免全局拦截器直接弹出英文错误
    return post<{ teacher: PerformanceLadderTeacherDto }>('/performance-ladder/teachers', data, {
      silent: true,
    } as any)
  },

  updateTeacher(id: string, data: Partial<SavePerformanceLadderTeacherPayload>) {
    return patch<{ teacher: PerformanceLadderTeacherDto }>(`/performance-ladder/teachers/${id}`, data, {
      silent: true,
    } as any)
  },

  deleteTeacher(id: string) {
    return del<{ success: boolean }>(`/performance-ladder/teachers/${id}`, { silent: true } as any)
  },
}
