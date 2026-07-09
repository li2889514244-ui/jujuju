import { get, post, put, del } from './request'

// ===== Types =====

export interface Organization {
  id: string
  name: string
  status: string
  plan: string
  maxAccounts: number
  maxUsers: number
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  _count?: { users: number }
}

export interface OrganizationStats {
  organization: Organization
  usage: {
    users: number
    maxUsers: number
    accounts: number
    maxAccounts: number
  }
}

export interface AdminUser {
  id: string
  email: string | null
  name: string
  avatar: string | null
  role: string
  status: string
  lastLoginAt: string | null
  createdAt: string
  organizationId: string | null
}

export interface SystemHealth {
  organizations: { total: number; active: number }
  users: { total: number; active: number }
  accounts: { total: number }
}

// ===== API Calls =====

/** 组织列表 */
export function listOrganizations(params?: { skip?: number; take?: number; search?: string }) {
  return get<{ organizations: Organization[]; total: number; skip: number; take: number }>(
    '/admin/organizations',
    params,
  )
}

/** 创建组织 */
export function createOrganization(data: {
  name: string
  maxAccounts?: number
  maxUsers?: number
  expiresAt?: string
}) {
  return post<Organization>('/admin/organizations', data)
}

/** 获取组织详情（含用量） */
export function getOrganizationStats(id: string) {
  return get<OrganizationStats>(`/admin/organizations/${id}`)
}

/** 更新组织 */
export function updateOrganization(
  id: string,
  data: {
    name?: string
    status?: string
    maxAccounts?: number
    maxUsers?: number
    expiresAt?: string | null
  },
) {
  return put<Organization>(`/admin/organizations/${id}`, data)
}

/** 冻结组织 */
export function deleteOrganization(id: string) {
  return del<{ success: boolean; status: string }>(`/admin/organizations/${id}`)
}

/** 在组织下创建用户 */
export function createUserInOrganization(
  organizationId: string,
  data: {
    email: string
    name: string
    password: string
    role?: string
  },
) {
  return post<AdminUser>(`/admin/organizations/${organizationId}/users`, data)
}

/** 全局用户列表 */
export function listUsers(params?: {
  skip?: number
  take?: number
  search?: string
  organizationId?: string
}) {
  return get<{ users: AdminUser[]; total: number; skip: number; take: number }>(
    '/admin/users',
    params,
  )
}

/** 修改用户 */
export function updateUser(
  id: string,
  data: {
    role?: string
    status?: string
    organizationId?: string
    name?: string
  },
) {
  return put<AdminUser>(`/admin/users/${id}`, data)
}

/** 系统健康 */
export function getSystemHealth() {
  return get<SystemHealth>('/admin/system/health')
}
