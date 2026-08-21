<template>
  <div class="admin-view">
    <!-- System Health Cards -->
    <el-row :gutter="16" class="health-cards">
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header>组织</template>
          <div class="stat-row">
            <span class="stat-value">{{ health?.organizations.total ?? '-' }}</span>
            <span class="stat-label">总数</span>
            <span class="stat-value active">{{ health?.organizations.active ?? '-' }}</span>
            <span class="stat-label">活跃</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header>用户</template>
          <div class="stat-row">
            <span class="stat-value">{{ health?.users.total ?? '-' }}</span>
            <span class="stat-label">总数</span>
            <span class="stat-value active">{{ health?.users.active ?? '-' }}</span>
            <span class="stat-label">活跃</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <template #header>账号</template>
          <div class="stat-row">
            <span class="stat-value">{{ health?.accounts.total ?? '-' }}</span>
            <span class="stat-label">已绑定</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- Tabs -->
    <el-tabs v-model="activeTab" class="admin-tabs" @tab-change="onTabChange">
      <!-- Organizations Tab -->
      <el-tab-pane label="组织管理" name="organizations">
        <div class="tab-header">
          <el-input
            v-model="orgSearch"
            placeholder="搜索组织名称..."
            style="width: 240px"
            clearable
            @clear="loadOrganizations"
            @keyup.enter="loadOrganizations"
          />
          <el-button type="primary" @click="showCreateOrg = true">创建组织</el-button>
        </div>
        <el-table v-loading="loadingOrgs" :data="organizations" stripe style="width: 100%">
          <el-table-column prop="name" label="名称" min-width="140" />
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'danger'" size="small">
                {{ row.status === 'ACTIVE' ? '正常' : '已冻结' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="用户数" width="80">
            <template #default="{ row }">
              {{ row._count?.users ?? 0 }}
            </template>
          </el-table-column>
          <el-table-column prop="maxAccounts" label="账号上限" width="90" />
          <el-table-column prop="maxUsers" label="用户上限" width="90" />
          <el-table-column label="到期时间" width="120">
            <template #default="{ row }">
              {{ row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : '永久' }}
            </template>
          </el-table-column>
          <el-table-column label="创建时间" width="120">
            <template #default="{ row }">
              {{ new Date(row.createdAt).toLocaleDateString() }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEditOrg(row)">编辑</el-button>
              <el-button
                v-if="row.status === 'ACTIVE'"
                size="small"
                type="warning"
                @click="freezeOrg(row)"
                >冻结</el-button
              >
              <el-button v-else size="small" type="success" @click="unfreezeOrg(row)"
                >解冻</el-button
              >
              <el-button size="small" @click="openCreateUser(row)">添加用户</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Users Tab -->
      <el-tab-pane label="用户管理" name="users">
        <div class="tab-header">
          <el-input
            v-model="userSearch"
            placeholder="搜索邮箱、手机号或姓名..."
            style="width: 240px"
            clearable
            @clear="loadUsers"
            @keyup.enter="loadUsers"
          />
          <el-select
            v-model="userOrgFilter"
            placeholder="筛选组织"
            clearable
            style="width: 200px"
            @change="loadUsers"
          >
            <el-option v-for="o in organizations" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </div>
        <el-table v-loading="loadingUsers" :data="users" stripe style="width: 100%">
          <el-table-column prop="name" label="姓名" min-width="120" />
          <el-table-column prop="email" label="邮箱" min-width="180" />
          <el-table-column prop="phone" label="手机号" min-width="140">
            <template #default="{ row }">
              {{ row.phone || '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="role" label="角色" width="120">
            <template #default="{ row }">
              <el-tag :type="roleTagType(row.role)" size="small">{{ roleLabel(row.role) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="small">
                {{ row.status === 'ACTIVE' ? '正常' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="最后登录" width="140">
            <template #default="{ row }">
              {{ row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : '从未' }}
            </template>
          </el-table-column>
          <el-table-column label="企业登录" width="120">
            <template #default="{ row }">
              <el-tag :type="row.feishuOpenId ? 'success' : 'info'" size="small">
                {{ row.feishuOpenId ? '飞书已绑定' : '未绑定' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="登录诊断" min-width="180">
            <template #default="{ row }">
              <el-tag :type="userDiagnosis(row).type" size="small">
                {{ userDiagnosis(row).title }}
              </el-tag>
              <div class="diagnosis-note">{{ userDiagnosis(row).note }}</div>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="250" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEditUser(row)">编辑</el-button>
              <el-button size="small" type="primary" @click="openResetPassword(row)"
                >重置密码</el-button
              >
              <el-button
                size="small"
                :type="row.status === 'ACTIVE' ? 'warning' : 'success'"
                @click="toggleUserStatus(row)"
                >{{ row.status === 'ACTIVE' ? '禁用' : '启用' }}</el-button
              >
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="企业登录" name="enterprise-login">
        <el-card v-loading="loadingEnterpriseLogin" class="enterprise-login-card" shadow="never">
          <template #header>
            <div class="enterprise-login-card__header">
              <span>飞书登录</span>
              <el-tag :type="enterpriseLogin?.feishu.enabled ? 'success' : 'danger'" size="small">
                {{ enterpriseLogin?.feishu.enabled ? '已配置' : '未完整配置' }}
              </el-tag>
            </div>
          </template>

          <el-descriptions :column="1" border>
            <el-descriptions-item label="接入方式">
              企业成员扫码授权后自动登录；首次登录会创建普通成员账号
            </el-descriptions-item>
            <el-descriptions-item label="App ID">
              {{ enterpriseLogin?.feishu.appIdConfigured ? enterpriseLogin.feishu.appId : '未配置' }}
            </el-descriptions-item>
            <el-descriptions-item label="App Secret">
              {{ enterpriseLogin?.feishu.appSecretConfigured ? '已配置' : '未配置' }}
            </el-descriptions-item>
            <el-descriptions-item label="飞书回调地址">
              {{ enterpriseLogin?.feishu.redirectUri || '未配置' }}
            </el-descriptions-item>
            <el-descriptions-item label="授权地址接口">
              {{ enterpriseLogin?.feishu.loginUrlEndpoint || '-' }}
            </el-descriptions-item>
            <el-descriptions-item label="回调接口">
              {{ enterpriseLogin?.feishu.callbackEndpoint || '-' }}
            </el-descriptions-item>
          </el-descriptions>

          <el-alert
            class="enterprise-login-card__alert"
            type="info"
            :closable="false"
            show-icon
            title="上线检查"
            description="飞书开放平台里的 OAuth 重定向 URL 必须和这里的飞书回调地址完全一致；请把应用可用范围限制在允许登录的企业成员内，首次飞书登录会自动创建普通成员账号。"
          />
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <!-- Create Organization Dialog -->
    <el-dialog v-model="showCreateOrg" title="创建组织" width="460px">
      <el-form :model="newOrg" label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="newOrg.name" placeholder="组织名称" />
        </el-form-item>
        <el-form-item label="账号上限">
          <el-input-number v-model="newOrg.maxAccounts" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="用户上限">
          <el-input-number v-model="newOrg.maxUsers" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker
            v-model="newOrg.expiresAt"
            type="date"
            placeholder="留空=永久"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateOrg = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="doCreateOrg">创建</el-button>
      </template>
    </el-dialog>

    <!-- Edit Organization Dialog -->
    <el-dialog v-model="showEditOrg" title="编辑组织" width="460px">
      <el-form v-if="editOrg" :model="editOrg" label-width="90px">
        <el-form-item label="名称">
          <el-input v-model="editOrg.name" />
        </el-form-item>
        <el-form-item label="账号上限">
          <el-input-number v-model="editOrg.maxAccounts" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="用户上限">
          <el-input-number v-model="editOrg.maxUsers" :min="1" :max="999" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker
            v-model="editOrg.expiresAt"
            type="date"
            placeholder="留空=永久"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditOrg = false">取消</el-button>
        <el-button type="primary" :loading="editing" @click="doEditOrg">保存</el-button>
      </template>
    </el-dialog>

    <!-- Create User Dialog -->
    <el-dialog v-model="showCreateUser" title="在组织下创建用户" width="460px">
      <el-form :model="newUser" label-width="70px">
        <el-form-item label="邮箱">
          <el-input v-model="newUser.email" placeholder="user@example.com（可选）" clearable />
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="newUser.phone" placeholder="13800138000" />
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="newUser.name" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="newUser.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="newUser.role" style="width: 100%">
            <el-option label="成员" value="MEMBER" />
            <el-option label="管理者" value="MANAGER" />
            <el-option label="管理员" value="ADMIN" />
            <el-option label="所有者" value="OWNER" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateUser = false">取消</el-button>
        <el-button type="primary" :loading="creatingUser" @click="doCreateUser">创建</el-button>
      </template>
    </el-dialog>

    <!-- Edit User Dialog -->
    <el-dialog v-model="showEditUser" title="编辑用户" width="460px">
      <el-form v-if="editUser" :model="editUser" label-width="70px">
        <el-form-item label="姓名">
          <el-input v-model="editUser.name" />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="editUser.phone" placeholder="留空则不使用手机号登录" clearable />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editUser.role" style="width: 100%">
            <el-option label="成员" value="MEMBER" />
            <el-option label="管理者" value="MANAGER" />
            <el-option label="管理员" value="ADMIN" />
            <el-option label="所有者" value="OWNER" />
            <el-option label="超级管理员" value="SUPER_ADMIN" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属组织">
          <el-select
            v-model="editUser.organizationId"
            clearable
            placeholder="无组织"
            style="width: 100%"
          >
            <el-option v-for="o in organizations" :key="o.id" :label="o.name" :value="o.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditUser = false">取消</el-button>
        <el-button type="primary" :loading="editingUser" @click="doEditUser">保存</el-button>
      </template>
    </el-dialog>

    <!-- Reset Password Dialog -->
    <el-dialog v-model="showResetPassword" title="重置用户密码" width="460px">
      <el-form label-width="90px">
        <el-form-item label="用户">
          <el-input :model-value="resetPasswordUser?.email || resetPasswordUser?.name || ''" disabled />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input
            v-model="resetPasswordValue"
            type="password"
            show-password
            placeholder="至少 8 位"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showResetPassword = false">取消</el-button>
        <el-button type="primary" :loading="resettingPassword" @click="doResetPassword"
          >重置</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listOrganizations,
  createOrganization,
  updateOrganization,
  createUserInOrganization,
  listUsers,
  updateUser,
  resetUserPassword,
  getSystemHealth,
  getEnterpriseLoginSettings,
  type Organization,
  type AdminUser,
  type SystemHealth,
  type EnterpriseLoginSettings,
} from '@/api/admin'

const activeTab = ref('organizations')
const health = ref<SystemHealth | null>(null)
const enterpriseLogin = ref<EnterpriseLoginSettings | null>(null)
const loadingEnterpriseLogin = ref(false)

// Organizations
const organizations = ref<Organization[]>([])
const loadingOrgs = ref(false)
const orgSearch = ref('')

// Users
const users = ref<AdminUser[]>([])
const loadingUsers = ref(false)
const userSearch = ref('')
const userOrgFilter = ref('')

// Create Organization
const showCreateOrg = ref(false)
const creating = ref(false)
const newOrg = ref({ name: '', maxAccounts: 20, maxUsers: 10, expiresAt: '' })

// Edit Organization
const showEditOrg = ref(false)
const editing = ref(false)
const editOrg = ref<Organization | null>(null)

// Create User
const showCreateUser = ref(false)
const creatingUser = ref(false)
const newUser = ref({ email: '', phone: '', name: '', password: '', role: 'MEMBER' })
const createUserForOrg = ref('')

// Edit User
const showEditUser = ref(false)
const editingUser = ref(false)
const editUser = ref<AdminUser | null>(null)

// Reset Password
const showResetPassword = ref(false)
const resettingPassword = ref(false)
const resetPasswordUser = ref<AdminUser | null>(null)
const resetPasswordValue = ref('')

function roleLabel(role: string) {
  const map: Record<string, string> = {
    SUPER_ADMIN: '超管',
    OWNER: '所有者',
    ADMIN: '管理员',
    MANAGER: '管理者',
    MEMBER: '成员',
    VIEWER: '访客',
  }
  return map[role] || role
}

function roleTagType(role: string): 'success' | 'primary' | 'warning' | 'info' | 'danger' {
  const map: Record<string, 'success' | 'primary' | 'warning' | 'info' | 'danger'> = {
    SUPER_ADMIN: 'danger',
    OWNER: 'warning',
    ADMIN: 'primary',
    MANAGER: 'success',
    MEMBER: 'info',
    VIEWER: 'info',
  }
  return map[role] || 'info'
}

function userDiagnosis(user: AdminUser): {
  type: 'success' | 'warning' | 'info' | 'danger'
  title: string
  note: string
} {
  if (!user.email) {
    return user.phone
      ? { type: 'success', title: '可手机号登录', note: '该用户可使用手机号和密码登录' }
      : { type: 'danger', title: '缺少登录账号', note: '需要补充邮箱或手机号后才能登录' }
  }
  if (user.email !== user.email.trim().toLowerCase()) {
    return { type: 'warning', title: '邮箱格式待确认', note: '建议统一使用小写邮箱登录' }
  }
  if (user.status !== 'ACTIVE') {
    return { type: 'danger', title: '用户已禁用', note: '启用用户后才能登录' }
  }
  if (user.organization?.status === 'DISABLED') {
    return { type: 'danger', title: '组织已冻结', note: '解冻组织后该用户才能登录' }
  }
  if (!user.lastLoginAt) {
    return { type: 'info', title: '从未登录', note: '可重置密码后把登录信息发给用户' }
  }
  return {
    type: 'success',
    title: '可正常登录',
    note: user.phone ? '可使用邮箱或手机号登录' : '可使用邮箱登录，补充手机号后也可手机号登录',
  }
}

async function loadHealth() {
  try {
    const res = await getSystemHealth()
    health.value = res.data
  } catch {
    /* ignore */
  }
}

async function loadOrganizations() {
  loadingOrgs.value = true
  try {
    const res = await listOrganizations({ search: orgSearch.value || undefined })
    organizations.value = res.data.organizations
  } catch {
    /* handled by interceptor */
  } finally {
    loadingOrgs.value = false
  }
}

async function loadUsers() {
  loadingUsers.value = true
  try {
    const res = await listUsers({
      search: userSearch.value || undefined,
      organizationId: userOrgFilter.value || undefined,
    })
    users.value = res.data.users
  } catch {
    /* handled by interceptor */
  } finally {
    loadingUsers.value = false
  }
}

function onTabChange(tab: any) {
  if (tab === 'users' && users.value.length === 0) loadUsers()
  if (tab === 'enterprise-login') loadEnterpriseLogin()
}

async function loadEnterpriseLogin() {
  loadingEnterpriseLogin.value = true
  try {
    const res = await getEnterpriseLoginSettings()
    enterpriseLogin.value = res.data
  } catch {
    /* handled by interceptor */
  } finally {
    loadingEnterpriseLogin.value = false
  }
}

async function doCreateOrg() {
  if (!newOrg.value.name) {
    ElMessage.warning('请输入组织名称')
    return
  }
  creating.value = true
  try {
    const data: any = {
      name: newOrg.value.name,
      maxAccounts: newOrg.value.maxAccounts,
      maxUsers: newOrg.value.maxUsers,
    }
    if (newOrg.value.expiresAt) data.expiresAt = new Date(newOrg.value.expiresAt).toISOString()
    await createOrganization(data)
    ElMessage.success('组织创建成功')
    showCreateOrg.value = false
    newOrg.value = { name: '', maxAccounts: 20, maxUsers: 10, expiresAt: '' }
    loadOrganizations()
    loadHealth()
  } catch {
    /* handled */
  } finally {
    creating.value = false
  }
}

function openEditOrg(o: Organization) {
  editOrg.value = { ...o }
  showEditOrg.value = true
}

async function doEditOrg() {
  if (!editOrg.value) return
  editing.value = true
  try {
    const data: any = {
      name: editOrg.value.name,
      maxAccounts: editOrg.value.maxAccounts,
      maxUsers: editOrg.value.maxUsers,
    }
    if (editOrg.value.expiresAt) data.expiresAt = new Date(editOrg.value.expiresAt).toISOString()
    else data.expiresAt = null
    await updateOrganization(editOrg.value.id, data)
    ElMessage.success('组织更新成功')
    showEditOrg.value = false
    loadOrganizations()
  } catch {
    /* handled */
  } finally {
    editing.value = false
  }
}

async function freezeOrg(o: Organization) {
  try {
    await ElMessageBox.confirm(
      `确定要冻结组织「${o.name}」吗？冻结后该组织下所有用户将无法登录。`,
      '确认',
      { type: 'warning' },
    )
    await updateOrganization(o.id, { status: 'DISABLED' })
    ElMessage.success('组织已冻结')
    loadOrganizations()
    loadHealth()
  } catch {
    /* cancelled or handled */
  }
}

async function unfreezeOrg(o: Organization) {
  await updateOrganization(o.id, { status: 'ACTIVE' })
  ElMessage.success('组织已解冻')
  loadOrganizations()
  loadHealth()
}

function openCreateUser(o: Organization) {
  createUserForOrg.value = o.id
  newUser.value = { email: '', phone: '', name: '', password: '', role: 'MEMBER' }
  showCreateUser.value = true
}

async function doCreateUser() {
  const createdEmail = newUser.value.email.trim().toLowerCase()
  const createdPhone = newUser.value.phone.trim()
  if ((!createdEmail && !createdPhone) || !newUser.value.name || !newUser.value.password) {
    ElMessage.warning('请填写完整信息')
    return
  }
  creatingUser.value = true
  try {
    const createdPassword = newUser.value.password
    await createUserInOrganization(createUserForOrg.value, {
      ...newUser.value,
      email: createdEmail || null,
      phone: createdPhone || undefined,
    })
    ElMessage.success('用户创建成功')
    showCreateUser.value = false
    await ElMessageBox.alert(
      createdEmail && createdPhone
        ? `请让用户使用邮箱 ${createdEmail} 或手机号 ${createdPhone}，以及初始密码 ${createdPassword} 登录。登录后建议用户到个人设置里修改密码。`
        : `请让用户使用${createdEmail ? `邮箱 ${createdEmail}` : `手机号 ${createdPhone}`} 和初始密码 ${createdPassword} 登录。登录后建议用户到个人设置里修改密码。`,
      '下一步',
      { confirmButtonText: '知道了' },
    )
    loadOrganizations()
    loadHealth()
  } catch {
    /* handled */
  } finally {
    creatingUser.value = false
  }
}

function openEditUser(u: AdminUser) {
  editUser.value = { ...u }
  showEditUser.value = true
}

async function doEditUser() {
  if (!editUser.value) return
  editingUser.value = true
  try {
    await updateUser(editUser.value.id, {
      name: editUser.value.name,
      phone: editUser.value.phone || null,
      role: editUser.value.role,
      organizationId: editUser.value.organizationId || undefined,
    })
    ElMessage.success('用户更新成功')
    showEditUser.value = false
    loadUsers()
  } catch {
    /* handled */
  } finally {
    editingUser.value = false
  }
}

function openResetPassword(u: AdminUser) {
  resetPasswordUser.value = u
  resetPasswordValue.value = ''
  showResetPassword.value = true
}

async function doResetPassword() {
  if (!resetPasswordUser.value) return
  if (!resetPasswordValue.value) {
    ElMessage.warning('请输入新密码')
    return
  }
  if (resetPasswordValue.value.length < 8) {
    ElMessage.warning('密码至少 8 位')
    return
  }

  resettingPassword.value = true
  try {
    await resetUserPassword(resetPasswordUser.value.id, resetPasswordValue.value)
    const loginName =
      resetPasswordUser.value.phone || resetPasswordUser.value.email || resetPasswordUser.value.name
    const password = resetPasswordValue.value
    ElMessage.success('密码已重置')
    showResetPassword.value = false
    resetPasswordValue.value = ''
    await ElMessageBox.alert(
      `请让用户使用 ${loginName} 和新密码 ${password} 登录。`,
      '下一步',
      { confirmButtonText: '知道了' },
    )
  } catch {
    /* handled */
  } finally {
    resettingPassword.value = false
  }
}

async function toggleUserStatus(u: AdminUser) {
  const newStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
  await updateUser(u.id, { status: newStatus })
  ElMessage.success(newStatus === 'ACTIVE' ? '用户已启用' : '用户已禁用')
  loadUsers()
}

onMounted(() => {
  loadHealth()
  loadOrganizations()
})
</script>

<style scoped lang="scss">
.admin-view {
  padding: 0;
}

.health-cards {
  margin-bottom: 20px;
}

.stat-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-color-primary);

  &.active {
    color: var(--el-color-success);
  }
}

.stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-right: 8px;
}

.admin-tabs {
  margin-top: 8px;
}

.tab-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}

.diagnosis-note {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.enterprise-login-card {
  max-width: 820px;
}

.enterprise-login-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.enterprise-login-card__alert {
  margin-top: 16px;
}
</style>
