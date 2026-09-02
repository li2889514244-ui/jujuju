<template>
  <div class="permission">
    <el-page-header title="返回团队管理" @back="$router.push('/team')">
      <template #content>权限管理</template>
    </el-page-header>

    <el-empty
      v-if="!teamStore.currentTeam"
      description="暂无真实团队数据"
      class="permission__empty"
    >
      <el-button type="primary" @click="$router.push('/team')">返回团队管理</el-button>
    </el-empty>

    <el-card v-else shadow="hover" class="permission__card">
      <template #header>
        <span>权限配置 - {{ teamStore.currentTeam.name }}</span>
      </template>

      <el-alert type="info" :closable="false" show-icon class="permission__tip">
        权限设置会保存到当前团队。没有团队数据时不会显示默认配置，避免把示例权限当成真实配置。
      </el-alert>

      <el-tabs v-model="activeRole" class="permission__tabs">
        <el-tab-pane label="管理员权限" name="admin" />
        <el-tab-pane label="成员权限" name="member" />
      </el-tabs>

      <el-table
        v-loading="loading"
        :data="filteredPermissions"
        stripe
        border
        class="permission__table"
        empty-text="暂无权限配置"
      >
        <el-table-column prop="name" label="权限名称" width="200" />
        <el-table-column prop="description" label="说明" min-width="300" />
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              :disabled="activeRole === 'admin' && row.alwaysEnabled"
            />
          </template>
        </el-table-column>
      </el-table>

      <div class="permission__footer">
        <el-button type="primary" :loading="saving" :disabled="loading" @click="handleSave">
          保存设置
        </el-button>
        <el-button :loading="saving" :disabled="loading" @click="handleReset">
          恢复默认
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { permissionsApi } from '@/api/permissions'
import { useTeamStore } from '@/store/team'

interface PermEntry {
  id: string
  name: string
  description: string
  enabled: boolean
  alwaysEnabled?: boolean
}

const ADMIN_DEFAULTS: PermEntry[] = [
  { id: 'manage_accounts', name: '管理账号', description: '添加、编辑、删除账号', enabled: true },
  { id: 'view_content', name: '查看内容', description: '查看团队内所有内容', enabled: true, alwaysEnabled: true },
  { id: 'create_content', name: '创建内容', description: '创建和编辑内容', enabled: true, alwaysEnabled: true },
  { id: 'publish_content', name: '发布内容', description: '发布内容到各平台', enabled: true },
  { id: 'view_analytics', name: '查看数据', description: '查看数据分析报告', enabled: true, alwaysEnabled: true },
  { id: 'export_data', name: '导出数据', description: '导出分析报告和数据', enabled: true },
  { id: 'manage_browser', name: '管理浏览器', description: '管理内置浏览器会话', enabled: true },
  { id: 'manage_team', name: '管理团队', description: '邀请、移除成员、修改角色', enabled: true },
  { id: 'manage_permissions', name: '管理权限', description: '修改团队权限设置', enabled: false },
]

const MEMBER_DEFAULTS: PermEntry[] = [
  { id: 'view_accounts', name: '查看账号', description: '查看团队内所有账号信息', enabled: true, alwaysEnabled: true },
  { id: 'manage_accounts', name: '管理账号', description: '添加、编辑、删除账号', enabled: true },
  { id: 'view_content', name: '查看内容', description: '查看团队内所有内容', enabled: true, alwaysEnabled: true },
  { id: 'create_content', name: '创建内容', description: '创建和编辑内容', enabled: true },
  { id: 'publish_content', name: '发布内容', description: '发布内容到各平台', enabled: false },
  { id: 'view_analytics', name: '查看数据', description: '查看数据分析报告', enabled: true },
  { id: 'export_data', name: '导出数据', description: '导出分析报告和数据', enabled: false },
  { id: 'manage_browser', name: '管理浏览器', description: '管理内置浏览器会话', enabled: true },
  { id: 'manage_team', name: '管理团队', description: '邀请、移除成员、修改角色', enabled: false },
  { id: 'manage_permissions', name: '管理权限', description: '修改团队权限设置', enabled: false },
]

const teamStore = useTeamStore()
const activeRole = ref<'admin' | 'member'>('admin')
const loading = ref(false)
const saving = ref(false)
const adminPermissions = ref<PermEntry[]>([])
const memberPermissions = ref<PermEntry[]>([])

const filteredPermissions = computed(() =>
  activeRole.value === 'admin' ? adminPermissions.value : memberPermissions.value,
)

async function loadPermissions() {
  const teamId = teamStore.currentTeam?.id
  if (!teamId) {
    adminPermissions.value = []
    memberPermissions.value = []
    return
  }

  loading.value = true
  try {
    const res = await permissionsApi.getPermissions(teamId)
    adminPermissions.value = (res.data?.admin ?? []).map((permission) =>
      markAlwaysEnabled(permission, 'admin'),
    )
    memberPermissions.value = (res.data?.member ?? []).map((permission) =>
      markAlwaysEnabled(permission, 'member'),
    )
  } catch {
    adminPermissions.value = []
    memberPermissions.value = []
    ElMessage.error('无法加载真实权限配置')
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  const teamId = teamStore.currentTeam?.id
  if (!teamId) {
    ElMessage.warning('暂无真实团队，不能保存权限')
    return
  }

  saving.value = true
  try {
    const res = await permissionsApi.updatePermissions({
      teamId,
      admin: adminPermissions.value.map((permission) => ({
        id: permission.id,
        enabled: permission.enabled,
      })),
      member: memberPermissions.value.map((permission) => ({
        id: permission.id,
        enabled: permission.enabled,
      })),
    })
    adminPermissions.value = (res.data?.admin ?? []).map((permission) =>
      markAlwaysEnabled(permission, 'admin'),
    )
    memberPermissions.value = (res.data?.member ?? []).map((permission) =>
      markAlwaysEnabled(permission, 'member'),
    )
    ElMessage.success('权限设置已保存')
  } catch {
    ElMessage.error('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

async function handleReset() {
  const teamId = teamStore.currentTeam?.id
  if (!teamId) {
    ElMessage.warning('暂无真实团队，不能恢复默认')
    return
  }

  saving.value = true
  try {
    const res = await permissionsApi.updatePermissions({
      teamId,
      admin: ADMIN_DEFAULTS.map((permission) => ({
        id: permission.id,
        enabled: permission.enabled,
      })),
      member: MEMBER_DEFAULTS.map((permission) => ({
        id: permission.id,
        enabled: permission.enabled,
      })),
    })
    adminPermissions.value = (res.data?.admin ?? []).map((permission) =>
      markAlwaysEnabled(permission, 'admin'),
    )
    memberPermissions.value = (res.data?.member ?? []).map((permission) =>
      markAlwaysEnabled(permission, 'member'),
    )
    ElMessage.success('已恢复默认设置')
  } catch {
    ElMessage.error('恢复默认失败，请重试')
  } finally {
    saving.value = false
  }
}

function markAlwaysEnabled(permission: PermEntry, roleType: 'admin' | 'member'): PermEntry {
  return {
    ...permission,
    alwaysEnabled:
      permission.id === 'view_content' ||
      permission.id === 'view_accounts' ||
      (roleType === 'admin' && permission.id === 'create_content') ||
      (roleType === 'admin' && permission.id === 'view_analytics'),
  }
}

onMounted(async () => {
  await teamStore.fetchTeams()
  await loadPermissions()
})
</script>

<style lang="scss" scoped>
.permission {
  max-width: 960px;
  display: flex;
  flex-direction: column;
  gap: $space-4;

  &__empty {
    padding: $space-8 0;
  }

  &__card {
    border-radius: $radius-lg;
  }

  &__tip {
    margin-bottom: $space-5;
  }

  &__tabs {
    margin-bottom: 0;
  }

  &__table {
    margin-bottom: $space-4;
  }

  &__footer {
    display: flex;
    gap: $space-2;
    justify-content: flex-end;
  }
}
</style>
