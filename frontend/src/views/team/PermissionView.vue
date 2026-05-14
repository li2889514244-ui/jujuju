<template>
  <div class="permission">
    <el-page-header @back="$router.push('/team')" title="返回团队管理">
      <template #content>权限管理</template>
    </el-page-header>

    <el-card shadow="hover" class="permission__card">
      <template #header>
        <span>权限配置 — {{ teamStore.currentTeam?.name }}</span>
      </template>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="permission__tip"
      >
        权限设置将影响团队内所有成员的操作范围。所有者拥有全部权限，不可修改。
      </el-alert>

      <!-- Role Tabs -->
      <el-tabs v-model="activeRole" class="permission__tabs">
        <el-tab-pane label="管理员权限" name="admin" />
        <el-tab-pane label="成员权限" name="member" />
      </el-tabs>

      <!-- Permissions Table -->
      <el-table :data="filteredPermissions" stripe border class="permission__table">
        <el-table-column prop="name" label="权限名称" width="200" />
        <el-table-column prop="description" label="说明" min-width="300" />
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              :disabled="activeRole === 'admin' && row.alwaysEnabled"
              @change="handlePermissionChange(row)"
            />
          </template>
        </el-table-column>
      </el-table>

      <div class="permission__footer">
        <el-button type="primary" @click="handleSave">保存设置</el-button>
        <el-button @click="handleReset">恢复默认</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useTeamStore } from '@/store/team'
import type { Permission } from '@/types'

const teamStore = useTeamStore()
const activeRole = ref('admin')

// Admin permissions with always-enabled flags
const adminPermissions = ref<(Permission & { alwaysEnabled?: boolean })[]>([
  { id: 'manage_accounts', name: '管理账号', description: '添加、编辑、删除账号', enabled: true },
  { id: 'view_content', name: '查看内容', description: '查看团队内所有内容', enabled: true, alwaysEnabled: true },
  { id: 'create_content', name: '创建内容', description: '创建和编辑内容', enabled: true, alwaysEnabled: true },
  { id: 'publish_content', name: '发布内容', description: '发布内容到各平台', enabled: true },
  { id: 'view_analytics', name: '查看数据', description: '查看数据分析报告', enabled: true, alwaysEnabled: true },
  { id: 'export_data', name: '导出数据', description: '导出分析报告和数据', enabled: true },
  { id: 'manage_browser', name: '管理浏览器', description: '管理内置浏览器会话', enabled: true },
  { id: 'manage_team', name: '管理团队', description: '邀请/移除成员、修改角色', enabled: true },
  { id: 'manage_permissions', name: '管理权限', description: '修改团队权限设置', enabled: false },
])

const memberPermissions = ref<(Permission & { alwaysEnabled?: boolean })[]>([
  { id: 'view_accounts', name: '查看账号', description: '查看团队内所有账号信息', enabled: true, alwaysEnabled: true },
  { id: 'manage_accounts', name: '管理账号', description: '添加、编辑、删除账号', enabled: false },
  { id: 'view_content', name: '查看内容', description: '查看团队内所有内容', enabled: true, alwaysEnabled: true },
  { id: 'create_content', name: '创建内容', description: '创建和编辑内容', enabled: true },
  { id: 'publish_content', name: '发布内容', description: '发布内容到各平台', enabled: false },
  { id: 'view_analytics', name: '查看数据', description: '查看数据分析报告', enabled: true },
  { id: 'export_data', name: '导出数据', description: '导出分析报告和数据', enabled: false },
  { id: 'manage_browser', name: '管理浏览器', description: '管理内置浏览器会话', enabled: false },
  { id: 'manage_team', name: '管理团队', description: '邀请/移除成员、修改角色', enabled: false },
  { id: 'manage_permissions', name: '管理权限', description: '修改团队权限设置', enabled: false },
])

const filteredPermissions = computed(() =>
  activeRole.value === 'admin' ? adminPermissions.value : memberPermissions.value
)

function handlePermissionChange(_perm: Permission & { alwaysEnabled?: boolean }) {
  // 本地标记变更，保存时统一提交
}

function handleSave() {
  const data = {
    admin: adminPermissions.value.map(p => ({ id: p.id, enabled: p.enabled })),
    member: memberPermissions.value.map(p => ({ id: p.id, enabled: p.enabled })),
  }
  localStorage.setItem('matrixflow_permissions', JSON.stringify(data))
  ElMessage.success('权限设置已保存到本地')
}

function handleReset() {
  localStorage.removeItem('matrixflow_permissions')
  // Rebuild default permissions
  const admins = adminPermissions.value.map(p => ({ ...p, enabled: true }))
  const members = memberPermissions.value.map(p => ({ ...p, enabled: true }))
  adminPermissions.value = admins
  memberPermissions.value = members
  ElMessage.info('已恢复默认设置')
}

onMounted(() => {
  teamStore.fetchTeams()
  // Restore saved permissions
  const saved = localStorage.getItem('matrixflow_permissions')
  if (saved) {
    try {
      const data = JSON.parse(saved)
      if (data.admin) adminPermissions.value = adminPermissions.value.map(p => {
        const s = data.admin.find((x: any) => x.id === p.id); return s ? { ...p, enabled: s.enabled } : p
      })
      if (data.member) memberPermissions.value = memberPermissions.value.map(p => {
        const s = data.member.find((x: any) => x.id === p.id); return s ? { ...p, enabled: s.enabled } : p
      })
    } catch { /* ignore corrupt data */ }
  }
})
</script>

<style lang="scss" scoped>
.permission {
  max-width: 900px;

  &__card {
    margin-top: 20px;
  }

  &__tip {
    margin-bottom: 20px;
  }

  &__tabs {
    margin-bottom: 0;
  }

  &__table {
    margin-bottom: 20px;
  }

  &__footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
}
</style>