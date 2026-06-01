import { get, put } from './request'
import type { ApiResponse } from '@/types'

export interface PermissionItem {
  id: string
  name: string
  description: string
  enabled: boolean
}

export interface PermissionsData {
  teamId: string
  admin: PermissionItem[]
  member: PermissionItem[]
}

export const permissionsApi = {
  /** 获取团队权限配置 */
  getPermissions(teamId: string): Promise<ApiResponse<PermissionsData>> {
    return get<PermissionsData>('/permissions', { teamId })
  },

  /** 更新团队权限配置 */
  updatePermissions(data: {
    teamId: string
    admin: { id: string; enabled: boolean }[]
    member: { id: string; enabled: boolean }[]
  }): Promise<ApiResponse<PermissionsData>> {
    return put<PermissionsData>('/permissions', data)
  },
}
