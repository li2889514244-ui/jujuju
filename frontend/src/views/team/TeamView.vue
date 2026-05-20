<template>
  <div class="team">
    <el-card shadow="hover">
      <template #header>
        <div class="team__header">
          <span>团队管理 — {{ teamStore.currentTeam?.name }}</span>
          <div>
            <el-button type="primary" @click="showInviteDialog = true">
              <el-icon><Plus /></el-icon>邀请成员
            </el-button>
            <el-button @click="$router.push('/team/permissions')">
              <el-icon><Setting /></el-icon>权限设置
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="teamStore.members" stripe v-loading="teamStore.loading">
        <el-table-column label="成员" min-width="200">
          <template #default="{ row }">
            <div class="team__member">
              <el-avatar :size="36" :src="row.avatar">{{ row.username?.charAt(0) }}</el-avatar>
              <div>
                <div class="team__member-name">{{ row.username }}</div>
                <div class="team__member-email">{{ row.email }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="role" label="角色" width="120">
          <template #default="{ row }">
            <StatusBadge :status="row.role" type="member" />
          </template>
        </el-table-column>
        <el-table-column prop="joinedAt" label="加入时间" width="160">
          <template #default="{ row }">{{ formatTime(row.joinedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <template v-if="row.role !== 'owner'">
              <el-select
                :model-value="row.role"
                size="small"
                style="width: 100px; margin-right: 8px"
                @change="(val: string) => handleRoleChange(row.id, val)"
              >
                <el-option label="管理员" value="admin" />
                <el-option label="成员" value="member" />
              </el-select>
              <el-button text type="danger" size="small" @click="handleRemove(row)">移除</el-button>
            </template>
            <span v-else class="team__owner-label">所有者</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Invite Dialog -->
    <el-dialog v-model="showInviteDialog" title="邀请成员" width="450px">
      <el-form ref="inviteFormRef" :model="inviteForm" :rules="inviteRules" label-width="80px">
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="inviteForm.email" placeholder="输入成员邮箱" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-radio-group v-model="inviteForm.role">
            <el-radio value="admin">管理员</el-radio>
            <el-radio value="member">成员</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showInviteDialog = false">取消</el-button>
        <el-button type="primary" :loading="inviting" @click="handleInvite">发送邀请</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { useTeamStore } from '@/store/team'
import type { TeamMember } from '@/types'
import StatusBadge from '@/components/common/StatusBadge.vue'

const teamStore = useTeamStore()

const showInviteDialog = ref(false)
const inviting = ref(false)
const inviteFormRef = ref<FormInstance>()

const inviteForm = reactive({ email: '', role: 'member' as 'admin' | 'member' })

const inviteRules: FormRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱', trigger: 'blur' },
  ],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
}

onMounted(() => {
  teamStore.fetchMembers()
})

async function handleInvite() {
  const valid = await inviteFormRef.value?.validate().catch(() => false)
  if (!valid) return

  inviting.value = true
  try {
    await teamStore.inviteMember(inviteForm)
    showInviteDialog.value = false
    inviteForm.email = ''
    inviteForm.role = 'member'
    ElMessage.success('邀请已发送')
  } catch {
    // handled
  } finally {
    inviting.value = false
  }
}

async function handleRoleChange(memberId: string, role: string) {
  await teamStore.updateMemberRole(memberId, role)
  ElMessage.success('角色已更新')
}

async function handleRemove(member: TeamMember) {
  await ElMessageBox.confirm(`确定移除成员"${member.username}"？`, '提示', { type: 'warning' })
  await teamStore.removeMember(member.id)
  ElMessage.success('成员已移除')
}

function formatTime(time: string) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-'
}
</script>

<style lang="scss" scoped>
.team {
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__member {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__member-name {
    font-size: 14px;
    font-weight: 500;
    color: #f5f5f7;
  }

  &__member-email {
    font-size: 12px;
    color: #6e6e73;
  }

  &__owner-label {
    font-size: 13px;
    color: #6e6e73;
  }
}
</style>
