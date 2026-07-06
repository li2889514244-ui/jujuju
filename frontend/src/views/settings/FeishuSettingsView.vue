<template>
  <div class="feishu-settings">
    <!-- Header -->
    <header class="fs-header">
      <div class="fs-header__left">
        <h2>飞书通知</h2>
        <p>把网站通知推到飞书群，第一时间掌握账号异常和发布结果。</p>
      </div>
      <el-tag v-if="!loading" :type="isBound ? 'success' : 'info'" effect="dark" size="large" round>
        {{ isBound ? '已连接' : '未连接' }}
      </el-tag>
    </header>

    <el-skeleton v-if="loading && !webhookSettings && !appSettings" :rows="6" animated />

    <template v-else>
      <!-- ════════ 未绑定：三步向导 ════════ -->
      <div v-if="!isBound && !appBound" class="wizard">
        <!-- 步骤 1 -->
        <div class="wizard-step">
          <div class="wizard-step__badge">1</div>
          <div class="wizard-step__body">
            <h3>在飞书群里添加自定义机器人</h3>
            <p>
              打开飞书 → 选一个群 → 点右上角「设置」→「群机器人」→「添加机器人」→
              选「自定义机器人」。
            </p>
          </div>
        </div>
        <div class="wizard-connector" />

        <!-- 步骤 2 -->
        <div class="wizard-step">
          <div class="wizard-step__badge">2</div>
          <div class="wizard-step__body">
            <h3>复制机器人地址</h3>
            <p>
              创建完成后飞书会给你一个网址（以 <code>https://open.feishu.cn</code> 开头），复制它。
            </p>
          </div>
        </div>
        <div class="wizard-connector" />

        <!-- 步骤 3 -->
        <div class="wizard-step wizard-step--active">
          <div class="wizard-step__badge">3</div>
          <div class="wizard-step__body">
            <h3>把地址粘贴到下面，点绑定</h3>
            <div class="wizard-input">
              <el-input
                v-model="webhookForm.webhookUrl"
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                spellcheck="false"
                clearable
                size="large"
                @keyup.enter="bindAndTest"
              />
              <el-button
                type="primary"
                size="large"
                :loading="binding"
                :disabled="!webhookForm.webhookUrl.trim()"
                @click="bindAndTest"
              >
                绑定并测试
              </el-button>
            </div>
            <p class="wizard-step__tip">
              绑定后我们会立刻往群里发一条测试消息，你到飞书确认收到就行。
            </p>
          </div>
        </div>
      </div>

      <!-- ════════ 已绑定：状态卡片 ════════ -->
      <template v-else>
        <!-- 当前绑定的模式 -->
        <div v-if="isBound" class="bound-card">
          <div class="bound-card__icon">
            <el-icon><CircleCheck /></el-icon>
          </div>
          <div class="bound-card__body">
            <div class="bound-card__title">群机器人已连接</div>
            <div class="bound-card__url">{{ webhookSettings?.webhookUrl }}</div>
          </div>
          <div class="bound-card__actions">
            <el-switch
              v-model="webhookForm.enabled"
              active-text="开"
              inactive-text="关"
              inline-prompt
              @change="toggleWebhook"
            />
            <el-button :loading="testing" @click="sendWebhookTest">
              <el-icon><Promotion /></el-icon>
              发测试
            </el-button>
          </div>
        </div>

        <!-- App 模式已绑定 -->
        <div v-if="appBound && !isBound" class="bound-card">
          <div class="bound-card__icon">
            <el-icon><CircleCheck /></el-icon>
          </div>
          <div class="bound-card__body">
            <div class="bound-card__title">应用机器人已连接</div>
            <div class="bound-card__url">App ID: {{ appSettings?.appId }}</div>
          </div>
          <div class="bound-card__actions">
            <el-switch
              v-model="appForm.enabled"
              active-text="开"
              inactive-text="关"
              inline-prompt
              @change="toggleApp"
            />
            <el-button :loading="testing" @click="sendAppTest">
              <el-icon><Promotion /></el-icon>
              发测试
            </el-button>
          </div>
        </div>

        <!-- 测试结果 -->
        <div
          v-if="testMessage"
          class="test-banner"
          :class="testOk ? 'test-banner--ok' : 'test-banner--fail'"
        >
          <el-icon class="test-banner__icon">
            <CircleCheck v-if="testOk" />
            <WarningFilled v-else />
          </el-icon>
          <span>{{ testMessage }}</span>
        </div>

        <!-- 环境变量不可写警告 -->
        <el-alert
          v-if="envNotWritable"
          type="warning"
          :closable="false"
          show-icon
          title="服务器配置文件不可写，重启后设置可能丢失。请联系管理员。"
          class="fs-alert"
        />

        <!-- ════════ 折叠区：设置 ════════ -->
        <el-collapse v-model="activeCollapse" class="fs-collapse">
          <!-- 更换机器人地址 -->
          <el-collapse-item title="更换群机器人地址" name="webhook">
            <div class="collapse-form">
              <el-input
                v-model="webhookForm.webhookUrl"
                placeholder="粘贴新的机器人地址"
                spellcheck="false"
                clearable
              />
              <el-button type="primary" :loading="saving" @click="saveWebhookSettings">
                保存
              </el-button>
            </div>
            <div class="collapse-form">
              <el-input
                v-model="webhookForm.webhookSecret"
                type="password"
                show-password
                placeholder="签名密钥（没开签名校验就不用填）"
                spellcheck="false"
                clearable
              />
            </div>
            <p class="collapse-hint">
              留空保存不会覆盖已有地址。只有飞书机器人安全设置里开了「签名校验」才需要填密钥。
            </p>
          </el-collapse-item>

          <!-- 通知类型 -->
          <el-collapse-item title="选择通知哪些类型" name="types">
            <p class="collapse-hint">不选 = 全部都推。一般保持默认就好。</p>
            <el-checkbox-group
              v-model="webhookForm.notifyTypes"
              class="type-chips"
              @change="saveNotifyTypes"
            >
              <el-checkbox-button
                v-for="item in notifyTypeOptions"
                :key="item.value"
                :label="item.value"
              >
                {{ item.label }}
              </el-checkbox-button>
            </el-checkbox-group>
          </el-collapse-item>

          <!-- 高级：应用机器人模式 -->
          <el-collapse-item title="高级：应用机器人模式（私信 + 卡片）" name="app">
            <el-alert
              type="info"
              :closable="false"
              show-icon
              title="应用机器人功能更全（私信、交互卡片），但需要在飞书开发者后台创建应用。大多数用户用上面的群机器人就够了。"
              class="fs-alert"
            />
            <el-form label-position="top" class="app-form" @submit.prevent>
              <el-form-item label="App ID">
                <el-input
                  v-model="appForm.appId"
                  placeholder="cli_xxxxxxxxxxxxxxxx"
                  spellcheck="false"
                  clearable
                />
                <div v-if="appSettings?.appId" class="collapse-hint">
                  当前：{{ appSettings.appId }}
                </div>
              </el-form-item>

              <el-form-item label="App Secret">
                <el-input
                  v-model="appForm.appSecret"
                  type="password"
                  show-password
                  placeholder="应用密钥"
                  spellcheck="false"
                  clearable
                />
                <div v-if="appSettings?.appSecretConfigured" class="collapse-hint">
                  已保存，留空不覆盖
                </div>
              </el-form-item>

              <el-form-item label="接收人类型">
                <el-radio-group v-model="appForm.receiveIdType" size="small">
                  <el-radio-button label="open_id">Open ID</el-radio-button>
                  <el-radio-button label="email">邮箱</el-radio-button>
                  <el-radio-button label="chat_id">群 ID</el-radio-button>
                  <el-radio-button label="user_id">User ID</el-radio-button>
                  <el-radio-button label="union_id">Union ID</el-radio-button>
                </el-radio-group>
              </el-form-item>

              <el-form-item label="接收人 ID">
                <el-input
                  v-model="appForm.receiveId"
                  :placeholder="receiveIdPlaceholder"
                  spellcheck="false"
                  clearable
                />
                <div class="collapse-hint">{{ receiveIdHint }}</div>
              </el-form-item>

              <el-form-item label="通知类型">
                <el-checkbox-group v-model="appForm.notifyTypes" class="type-chips">
                  <el-checkbox-button
                    v-for="item in notifyTypeOptions"
                    :key="item.value"
                    :label="item.value"
                  >
                    {{ item.label }}
                  </el-checkbox-button>
                </el-checkbox-group>
              </el-form-item>

              <div class="app-form__actions">
                <el-button type="primary" :loading="saving" @click="saveAppSettings">
                  保存配置
                </el-button>
                <el-button
                  :loading="testing"
                  :disabled="!appSettings?.configured"
                  @click="sendAppTest"
                >
                  发测试卡片
                </el-button>
              </div>
            </el-form>

            <details class="app-guide">
              <summary>应用机器人配置步骤</summary>
              <ol>
                <li>
                  打开
                  <a href="https://open.feishu.cn/app" target="_blank" rel="noopener"
                    >飞书开发者后台</a
                  >，创建企业自建应用
                </li>
                <li>应用详情 → 添加应用能力 → 机器人</li>
                <li>权限管理 → 搜索并开通 <code>im:message</code></li>
                <li>凭证与基础信息 → 复制 App ID 和 App Secret</li>
                <li>设置接收人：私信填 open_id，群聊填 chat_id 并把机器人加进群</li>
                <li>发布新版本，应用才生效</li>
              </ol>
            </details>
          </el-collapse-item>
        </el-collapse>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheck, Promotion, WarningFilled } from '@element-plus/icons-vue'
import {
  notificationApi,
  type FeishuNotifyType,
  type FeishuReceiveIdType,
  type FeishuSettings,
  type FeishuAppSettings,
} from '@/api/notifications'

const notifyTypeOptions: Array<{ label: string; value: FeishuNotifyType }> = [
  { label: '系统', value: 'SYSTEM' },
  { label: '账号', value: 'ACCOUNT' },
  { label: '内容', value: 'CONTENT' },
  { label: '报告', value: 'REPORT' },
  { label: '发布成功', value: 'PUBLISH_SUCCESS' },
  { label: '发布失败', value: 'PUBLISH_FAILED' },
  { label: '凭证过期', value: 'CREDENTIAL_EXPIRED' },
]

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const binding = ref(false)
const activeCollapse = ref<string[]>([])

// ── Webhook state ──────────────────────────────────────
const webhookSettings = ref<FeishuSettings | null>(null)
const testMessage = ref('')
const testOk = ref(false)

const webhookForm = reactive<{
  webhookUrl: string
  webhookSecret: string
  enabled: boolean
  notifyTypes: FeishuNotifyType[]
}>({
  webhookUrl: '',
  webhookSecret: '',
  enabled: true,
  notifyTypes: ['SYSTEM', 'PUBLISH_FAILED', 'CREDENTIAL_EXPIRED'],
})

// ── App state ──────────────────────────────────────────
const appSettings = ref<FeishuAppSettings | null>(null)

const appForm = reactive<{
  appId: string
  appSecret: string
  receiveIdType: FeishuReceiveIdType
  receiveId: string
  enabled: boolean
  notifyTypes: FeishuNotifyType[]
}>({
  appId: '',
  appSecret: '',
  receiveIdType: 'open_id',
  receiveId: '',
  enabled: true,
  notifyTypes: ['SYSTEM', 'PUBLISH_FAILED', 'CREDENTIAL_EXPIRED'],
})

// ── Computed ───────────────────────────────────────────

const isBound = computed(() => Boolean(webhookSettings.value?.configured))
const appBound = computed(() => Boolean(appSettings.value?.configured))
const envNotWritable = computed(() =>
  Boolean(
    (webhookSettings.value && !webhookSettings.value.envFileWritable) ||
    (appSettings.value && !appSettings.value.envFileWritable),
  ),
)

const receiveIdPlaceholder = computed(() => {
  switch (appForm.receiveIdType) {
    case 'open_id':
      return 'ou_xxxxxxxxxxxxxxxx'
    case 'user_id':
      return '用户 User ID'
    case 'union_id':
      return 'on_xxxxxxxxxxxxxxxx'
    case 'email':
      return 'user@example.com'
    case 'chat_id':
      return 'oc_xxxxxxxxxxxxxxxx'
    default:
      return ''
  }
})

const receiveIdHint = computed(() => {
  switch (appForm.receiveIdType) {
    case 'chat_id':
      return '确保机器人已加入目标群聊。'
    case 'email':
      return '接收人需是飞书注册用户且在应用可用范围内。'
    default:
      return '接收人需在应用的可用范围内（开发者后台 → 应用详情 → 可用范围）。'
  }
})

// ── Lifecycle ──────────────────────────────────────────

onMounted(() => {
  loadSettings()
})

// ── Load ───────────────────────────────────────────────

async function loadSettings() {
  loading.value = true
  try {
    const [webhookRes, appRes] = await Promise.all([
      notificationApi.getFeishuSettings(),
      notificationApi.getFeishuAppSettings(),
    ])
    applyWebhookSettings(webhookRes.data)
    applyAppSettings(appRes.data)
  } catch {
    // ignore
  } finally {
    loading.value = false
  }
}

// ── Bind & test (向导中的「绑定并测试」) ────────────────

async function bindAndTest() {
  const url = webhookForm.webhookUrl.trim()
  if (!url) {
    ElMessage.warning('请先粘贴机器人地址')
    return
  }

  binding.value = true
  testMessage.value = ''
  try {
    // 1. 保存
    const res = await notificationApi.updateFeishuSettings({
      webhookUrl: url,
      webhookSecret: webhookForm.webhookSecret.trim() || undefined,
      enabled: true,
      notifyTypes: webhookForm.notifyTypes,
    })
    applyWebhookSettings(res.data)
    webhookForm.webhookUrl = ''
    webhookForm.webhookSecret = ''
    ElMessage.success('绑定成功，正在发送测试消息…')

    // 2. 自动发测试
    await sendWebhookTest()
  } catch (error) {
    ElMessage.error(explainError(error, '绑定失败'))
  } finally {
    binding.value = false
  }
}

// ── Webhook actions ────────────────────────────────────

async function toggleWebhook(val: boolean) {
  try {
    const res = await notificationApi.updateFeishuSettings({
      enabled: val,
      notifyTypes: webhookForm.notifyTypes,
    })
    applyWebhookSettings(res.data)
    ElMessage.success(val ? '通知已开启' : '通知已暂停')
  } catch {
    webhookForm.enabled = !val // 回滚
    ElMessage.error('操作失败')
  }
}

async function saveWebhookSettings() {
  const webhookUrl = webhookForm.webhookUrl.trim()
  saving.value = true
  try {
    const res = await notificationApi.updateFeishuSettings({
      webhookUrl: webhookUrl || undefined,
      webhookSecret: webhookForm.webhookSecret.trim() || undefined,
      enabled: webhookForm.enabled,
      notifyTypes: webhookForm.notifyTypes,
    })
    applyWebhookSettings(res.data)
    webhookForm.webhookUrl = ''
    webhookForm.webhookSecret = ''
    ElMessage.success('已保存')
    activeCollapse.value = activeCollapse.value.filter((n) => n !== 'webhook')
  } catch (error) {
    ElMessage.error(explainError(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function saveNotifyTypes() {
  try {
    const res = await notificationApi.updateFeishuSettings({
      enabled: webhookForm.enabled,
      notifyTypes: webhookForm.notifyTypes,
    })
    applyWebhookSettings(res.data)
  } catch {
    // silent
  }
}

async function sendWebhookTest() {
  testing.value = true
  try {
    const res = await notificationApi.testFeishu()
    testOk.value = res.data.sent
    testMessage.value = res.data.sent
      ? '测试消息已发送，去飞书群看看有没有收到吧！'
      : explainFeishuFailure(res.data.message)

    if (res.data.sent) {
      ElMessage.success('测试消息已发送')
    } else {
      ElMessage.warning(testMessage.value)
    }
  } catch (error) {
    testOk.value = false
    testMessage.value = explainError(error, '测试发送失败')
    ElMessage.error(testMessage.value)
  } finally {
    testing.value = false
  }
}

// ── App actions ────────────────────────────────────────

async function toggleApp(val: boolean) {
  try {
    const res = await notificationApi.updateFeishuAppSettings({
      enabled: val,
      notifyTypes: appForm.notifyTypes,
      receiveIdType: appForm.receiveIdType,
    })
    applyAppSettings(res.data)
    ElMessage.success(val ? '通知已开启' : '通知已暂停')
  } catch {
    appForm.enabled = !val
    ElMessage.error('操作失败')
  }
}

async function saveAppSettings() {
  const appId = appForm.appId.trim()
  const appSecret = appForm.appSecret.trim()
  const receiveId = appForm.receiveId.trim()

  if (!appId && !appSettings.value?.appId) {
    ElMessage.warning('请填写 App ID')
    return
  }
  if (!receiveId && !appSettings.value?.receiveId) {
    ElMessage.warning('请填写接收人 ID')
    return
  }

  saving.value = true
  try {
    const res = await notificationApi.updateFeishuAppSettings({
      appId: appId || undefined,
      appSecret: appSecret || undefined,
      receiveIdType: appForm.receiveIdType,
      receiveId: receiveId || undefined,
      enabled: appForm.enabled,
      notifyTypes: appForm.notifyTypes,
    })
    applyAppSettings(res.data)
    appForm.appId = ''
    appForm.appSecret = ''
    ElMessage.success('应用机器人配置已保存')
  } catch (error) {
    ElMessage.error(explainError(error, '保存失败'))
  } finally {
    saving.value = false
  }
}

async function sendAppTest() {
  testing.value = true
  try {
    const res = await notificationApi.testFeishuApp()
    testOk.value = res.data.sent
    testMessage.value = res.data.sent
      ? '测试卡片已发送，去飞书看看吧！'
      : explainAppFailure(res.data.message)

    if (res.data.sent) {
      ElMessage.success('测试卡片已发送')
    } else {
      ElMessage.warning(testMessage.value)
    }
  } catch (error) {
    testOk.value = false
    testMessage.value = explainError(error, '测试发送失败')
    ElMessage.error(testMessage.value)
  } finally {
    testing.value = false
  }
}

// ── Helpers ────────────────────────────────────────────

function applyWebhookSettings(next: FeishuSettings) {
  webhookSettings.value = next
  webhookForm.enabled = next.enabled
  webhookForm.notifyTypes = next.notifyTypes.length ? next.notifyTypes : []
}

function applyAppSettings(next: FeishuAppSettings) {
  appSettings.value = next
  appForm.enabled = next.enabled
  appForm.receiveIdType = next.receiveIdType
  appForm.receiveId = next.receiveId
  appForm.notifyTypes = next.notifyTypes.length ? next.notifyTypes : []
}

function explainFeishuFailure(message = '') {
  if (!message) return '发送失败，请检查机器人地址是否正确。'
  if (message.includes('FEISHU_WEBHOOK_URL')) return '还没有保存机器人地址。'
  if (message.includes('19021') || message.includes('sign') || message.includes('signature'))
    return '飞书拒收：签名校验失败。请在机器人设置里关掉签名校验，或填对密钥。'
  if (message.includes('19024') || /key\s*words?/i.test(message) || message.includes('关键词'))
    return '飞书拒收：关键词不匹配。建议机器人关键词填 MatrixFlow。'
  if (message.includes('19022') || /ip\s*not\s*allowed/i.test(message))
    return '飞书拒收：服务器 IP 不在白名单。'
  if (message.includes('11232') || message.includes('rate') || message.includes('限流'))
    return '飞书限流：稍后再试。'
  return `飞书返回：${message}`
}

function explainAppFailure(message = '') {
  if (!message) return '发送失败，请检查 App ID / Secret / 接收人是否正确。'
  if (message.includes('FEISHU_APP_ID') || message.includes('FEISHU_APP_SECRET'))
    return '还没配置 App ID 或 Secret。'
  if (message.includes('FEISHU_RECEIVE_ID')) return '还没配置接收人 ID。'
  if (message.includes('99991663') || message.includes('token'))
    return '获取 token 失败：请检查 App ID 和 Secret。'
  if (message.includes('99991672') || message.includes('permission'))
    return '权限不足：请申请 im:message 权限并审批通过。'
  if (message.includes('230001') || message.includes('not exist') || message.includes('chat_id'))
    return '接收人不存在：请检查 ID 是否正确，机器人是否已加入群。'
  if (message.includes('230002') || message.includes('range') || message.includes('scope'))
    return '接收人不在应用可用范围内。'
  if (message.includes('rate') || message.includes('限流')) return '飞书限流：稍后再试。'
  return `飞书返回：${message}`
}

function explainError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
</script>

<style lang="scss" scoped>
.feishu-settings {
  max-width: 720px;
  margin: 0 auto;
  padding: 28px;
  color: $text-primary;
}

// ── Header ─────────────────────────────────────────────

.fs-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;

  h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
  }

  p {
    margin: 8px 0 0;
    color: $text-secondary;
    font-size: 14px;
  }
}

// ── Wizard ─────────────────────────────────────────────

.wizard {
  background: $bg-elevated;
  border: 1px solid $border-base;
  border-radius: $radius-lg;
  padding: 28px;
  box-shadow: $shadow-sm;
}

.wizard-step {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  position: relative;

  &__badge {
    width: 32px;
    height: 32px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-full;
    background: rgba(99, 102, 241, 0.12);
    color: $accent-300;
    font-size: 15px;
    font-weight: 700;
    border: 2px solid rgba(99, 102, 241, 0.3);
    transition: all 0.25s $ease-out;
  }

  &--active &__badge {
    background: $accent-500;
    color: #fff;
    border-color: $accent-400;
    box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.15);
  }

  &__body {
    flex: 1;
    min-width: 0;
    padding-top: 3px;

    h3 {
      margin: 0 0 6px;
      font-size: 15px;
      font-weight: 700;
      color: $text-primary;
    }

    p {
      margin: 0;
      color: $text-secondary;
      font-size: 13px;
      line-height: 1.7;

      code {
        padding: 1px 5px;
        border-radius: 3px;
        background: rgba(99, 102, 241, 0.12);
        color: $accent-300;
        font-size: 12px;
      }
    }
  }

  &__tip {
    margin-top: 10px !important;
    color: $text-tertiary !important;
    font-size: 12px !important;
  }
}

.wizard-connector {
  width: 2px;
  height: 24px;
  margin-left: 15px;
  background: $border-base;
}

.wizard-input {
  display: flex;
  gap: 10px;
  margin-top: 12px;

  .el-input {
    flex: 1;
  }
}

// ── Bound card ─────────────────────────────────────────

.bound-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: $radius-lg;
  margin-bottom: 16px;

  &__icon {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-full;
    background: rgba(16, 185, 129, 0.14);
    color: $color-success;
    font-size: 22px;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: 16px;
    font-weight: 700;
  }

  &__url {
    margin-top: 4px;
    color: $text-tertiary;
    font-size: 12px;
    overflow-wrap: anywhere;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
}

// ── Test banner ────────────────────────────────────────

.test-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: $radius-md;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.6;

  &--ok {
    color: $color-success;
    background: rgba(16, 185, 129, 0.1);
  }

  &--fail {
    color: $color-warning;
    background: rgba(245, 158, 11, 0.1);
  }

  &__icon {
    font-size: 18px;
    flex-shrink: 0;
  }
}

// ── Alert ──────────────────────────────────────────────

.fs-alert {
  margin-bottom: 16px;
}

// ── Collapse ───────────────────────────────────────────

.fs-collapse {
  border: 1px solid $border-subtle;
  border-radius: $radius-lg;
  background: $bg-elevated;
  overflow: hidden;

  :deep(.el-collapse-item__header) {
    padding: 0 20px;
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
    background: transparent;
    border-bottom: 1px solid $border-subtle;
  }

  :deep(.el-collapse-item__content) {
    padding: 20px;
    background: transparent;
  }

  :deep(.el-collapse-item__wrap) {
    border-bottom: 1px solid $border-subtle;

    &:last-child {
      border-bottom: none;
    }
  }
}

.collapse-form {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;

  .el-input {
    flex: 1;
  }
}

.collapse-hint {
  margin: 6px 0 0;
  color: $text-tertiary;
  font-size: 12px;
  line-height: 1.6;

  code {
    padding: 1px 4px;
    border-radius: 3px;
    background: rgba(99, 102, 241, 0.1);
    color: $accent-300;
    font-size: 11px;
  }
}

.type-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  :deep(.el-checkbox-button__inner) {
    border-left: 1px solid var(--el-border-color);
    border-radius: $radius-sm;
  }
}

// ── App form ───────────────────────────────────────────

.app-form {
  :deep(.el-form-item__label) {
    color: $text-secondary;
    font-weight: 600;
    font-size: 13px;
  }

  &__actions {
    display: flex;
    gap: 10px;
    margin-top: 8px;
  }
}

.app-guide {
  margin-top: 20px;
  padding: 14px 16px;
  border: 1px solid $border-subtle;
  border-radius: $radius-md;
  background: rgba(255, 255, 255, 0.02);

  summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: $text-secondary;
    user-select: none;
  }

  ol {
    margin: 12px 0 0;
    padding-left: 20px;
    color: $text-tertiary;
    font-size: 12px;
    line-height: 2;

    code {
      padding: 1px 4px;
      border-radius: 3px;
      background: rgba(99, 102, 241, 0.1);
      color: $accent-300;
      font-size: 11px;
    }

    a {
      color: $accent-300;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  }
}

// ── Responsive ─────────────────────────────────────────

@media (max-width: 640px) {
  .feishu-settings {
    padding: 18px;
  }

  .fs-header {
    flex-direction: column;
    gap: 10px;
  }

  .bound-card {
    flex-direction: column;
    align-items: stretch;
    text-align: left;

    &__actions {
      justify-content: flex-end;
    }
  }

  .wizard-input {
    flex-direction: column;
  }
}
</style>
