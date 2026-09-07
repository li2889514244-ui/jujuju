<template>
  <main class="oauth-consent">
    <section class="oauth-consent__panel">
      <div class="oauth-consent__brand">
        <div class="oauth-consent__mark">P</div>
        <div>
          <p>披星云</p>
          <span>矩阵流数据授权</span>
        </div>
      </div>

      <div v-if="loading" class="oauth-consent__state">
        <el-skeleton :rows="5" animated />
      </div>

      <div v-else-if="error" class="oauth-consent__state">
        <h1>授权请求已失效</h1>
        <p>{{ error }}</p>
        <el-button type="primary" @click="router.replace('/dashboard')">返回系统</el-button>
      </div>

      <template v-else-if="authorization">
        <div class="oauth-consent__header">
          <span class="oauth-consent__client">{{ authorization.clientName }}</span>
          <h1>ChatGPT 正在申请访问你的矩阵流数据</h1>
          <p>{{ authorization.description }}</p>
        </div>

        <div class="oauth-consent__permissions">
          <h2>它将能够</h2>
          <ul>
            <li><el-icon><Check /></el-icon>读取矩阵账号数据</li>
            <li><el-icon><Check /></el-icon>读取视频数据</li>
            <li><el-icon><Check /></el-icon>读取运营分析数据</li>
          </ul>
        </div>

        <div class="oauth-consent__permissions oauth-consent__permissions--muted">
          <h2>它不会</h2>
          <ul>
            <li><el-icon><Close /></el-icon>修改你的业务数据</li>
            <li><el-icon><Close /></el-icon>删除账号或作品</li>
          </ul>
        </div>

        <div class="oauth-consent__meta">
          <span>权限</span>
          <strong>{{ authorization.scope }}</strong>
          <span>资源</span>
          <strong>{{ authorization.resource }}</strong>
        </div>

        <div class="oauth-consent__actions">
          <el-button :loading="submitting" @click="deny">取消</el-button>
          <el-button type="primary" :loading="submitting" @click="approve">允许访问</el-button>
        </div>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Check, Close } from '@element-plus/icons-vue'
import { mcpApi, type McpOAuthAuthorizationInfo } from '@/api/mcp'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const authorization = ref<McpOAuthAuthorizationInfo | null>(null)

const transactionId = computed(() => {
  const raw = route.query.transaction
  return Array.isArray(raw) ? String(raw[0] || '') : String(raw || '')
})

onMounted(loadAuthorization)

async function loadAuthorization() {
  if (!transactionId.value) {
    error.value = '缺少授权事务，请重新从 ChatGPT 发起连接。'
    loading.value = false
    return
  }

  try {
    const res = await mcpApi.getOAuthAuthorization(transactionId.value)
    authorization.value = res.data
  } catch {
    error.value = '授权请求已过期或不存在，请回到 ChatGPT 重新连接。'
  } finally {
    loading.value = false
  }
}

async function approve() {
  if (!transactionId.value) return
  submitting.value = true
  try {
    const res = await mcpApi.approveOAuthAuthorization(transactionId.value)
    window.location.href = res.data.redirectTo
  } catch {
    ElMessage.error('授权失败，请重新发起连接。')
    submitting.value = false
  }
}

async function deny() {
  if (!transactionId.value) return
  submitting.value = true
  try {
    const res = await mcpApi.denyOAuthAuthorization(transactionId.value)
    window.location.href = res.data.redirectTo
  } catch {
    ElMessage.error('取消授权失败，请重新发起连接。')
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
.oauth-consent {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px 16px;
  background:
    radial-gradient(circle at 20% 12%, rgba(71, 85, 105, 0.2), transparent 28%),
    linear-gradient(135deg, #08111f 0%, #111827 52%, #172033 100%);
  color: #e5e7eb;
}

.oauth-consent__panel {
  width: min(560px, 100%);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  padding: 28px;
  background: rgba(15, 23, 42, 0.94);
  box-shadow: 0 22px 55px rgba(0, 0, 0, 0.34);
}

.oauth-consent__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;

  p {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
  }

  span {
    color: #94a3b8;
    font-size: 13px;
  }
}

.oauth-consent__mark {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 800;
  background: linear-gradient(135deg, #2dd4bf, #6366f1);
  color: white;
}

.oauth-consent__header {
  margin-bottom: 22px;

  h1 {
    margin: 8px 0 10px;
    font-size: 28px;
    line-height: 1.28;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    color: #a8b3c7;
    line-height: 1.7;
  }
}

.oauth-consent__client {
  display: inline-flex;
  color: #99f6e4;
  font-size: 14px;
  font-weight: 700;
}

.oauth-consent__permissions {
  padding: 18px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.18);

  h2 {
    margin: 0 0 12px;
    font-size: 15px;
    color: #cbd5e1;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #f8fafc;
  }

  .el-icon {
    color: #34d399;
  }
}

.oauth-consent__permissions--muted {
  .el-icon {
    color: #94a3b8;
  }

  li {
    color: #cbd5e1;
  }
}

.oauth-consent__meta {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px 12px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  background: rgba(30, 41, 59, 0.62);
  color: #94a3b8;
  font-size: 13px;

  strong {
    min-width: 0;
    overflow-wrap: anywhere;
    color: #e5e7eb;
    font-weight: 600;
  }
}

.oauth-consent__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.oauth-consent__state {
  h1 {
    margin: 0 0 12px;
    font-size: 26px;
    letter-spacing: 0;
  }

  p {
    margin: 0 0 20px;
    color: #a8b3c7;
  }
}

@media (max-width: 560px) {
  .oauth-consent__panel {
    padding: 22px;
  }

  .oauth-consent__header h1 {
    font-size: 23px;
  }

  .oauth-consent__actions {
    flex-direction: column-reverse;

    .el-button {
      width: 100%;
      margin-left: 0;
    }
  }
}
</style>
