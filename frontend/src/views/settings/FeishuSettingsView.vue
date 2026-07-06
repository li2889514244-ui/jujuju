<template>
  <div class="feishu-settings">
    <div class="feishu-settings__header">
      <div>
        <h2>飞书通知</h2>
        <p>用飞书接收网站通知。支持群机器人 Webhook 和应用机器人 OpenAPI 两种模式。</p>
      </div>
      <el-button :loading="loading" @click="loadSettings">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <el-skeleton v-if="loading && !webhookSettings && !appSettings" :rows="8" animated />

    <template v-else>
      <!-- 模式切换 -->
      <section class="mode-switcher">
        <div
          class="mode-card"
          :class="{ 'mode-card--active': activeMode === 'webhook' }"
          @click="activeMode = 'webhook'"
        >
          <div class="mode-card__icon">
            <el-icon><Link /></el-icon>
          </div>
          <div class="mode-card__body">
            <div class="mode-card__title">群机器人 Webhook</div>
            <div class="mode-card__desc">简单快捷，往飞书群发文本通知</div>
          </div>
          <el-icon v-if="webhookSettings?.configured" class="mode-card__check">
            <CircleCheck />
          </el-icon>
        </div>

        <div
          class="mode-card"
          :class="{ 'mode-card--active': activeMode === 'app' }"
          @click="activeMode = 'app'"
        >
          <div class="mode-card__icon">
            <el-icon><Connection /></el-icon>
          </div>
          <div class="mode-card__body">
            <div class="mode-card__title">应用机器人 OpenAPI</div>
            <div class="mode-card__desc">功能完整，支持私信 + 交互式卡片</div>
          </div>
          <el-icon v-if="appSettings?.configured" class="mode-card__check">
            <CircleCheck />
          </el-icon>
        </div>
      </section>

      <!-- ═══════════════ Webhook 模式 ═══════════════ -->

      <template v-if="activeMode === 'webhook'">
        <section
          class="status-strip"
          :class="{ 'status-strip--enabled': webhookSettings?.configured }"
        >
          <div class="status-strip__icon">
            <el-icon>
              <CircleCheck v-if="webhookSettings?.configured" />
              <WarningFilled v-else />
            </el-icon>
          </div>
          <div class="status-strip__body">
            <div class="status-strip__title">
              {{ webhookSettings?.configured ? '群机器人已绑定' : '群机器人未绑定' }}
            </div>
            <div class="status-strip__text">
              {{
                webhookSettings?.configured
                  ? `通知已${webhookSettings.enabled ? '启用' : '暂停'}，Webhook：${webhookSettings.webhookUrl}`
                  : '先在飞书群里添加自定义机器人，然后把 Webhook URL 粘贴到这里。'
              }}
            </div>
          </div>
          <el-tag :type="webhookSettings?.enabled ? 'success' : 'info'" effect="dark">
            {{ webhookSettings?.enabled ? '启用中' : '已暂停' }}
          </el-tag>
        </section>

        <section class="settings-panel">
          <div class="settings-panel__main">
            <div class="section-title">
              <el-icon><Bell /></el-icon>
              <span>绑定群机器人</span>
            </div>

            <el-alert
              class="mode-alert"
              type="info"
              :closable="false"
              show-icon
              title="这里接的是飞书群自定义机器人 Webhook，用来往群里发通知。"
            />

            <el-alert
              v-if="webhookSettings && !webhookSettings.envFileWritable"
              class="mode-alert"
              type="warning"
              :closable="false"
              show-icon
              title="服务器 .env 文件不可写，保存的设置在服务重启后会丢失。请联系管理员修复文件权限。"
            />

            <el-form label-position="top" class="settings-form" @submit.prevent>
              <el-form-item label="Webhook URL">
                <el-input
                  v-model="webhookForm.webhookUrl"
                  placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                  spellcheck="false"
                  clearable
                />
                <div v-if="webhookSettings?.configured" class="form-hint">
                  当前已保存 Webhook；留空保存不会覆盖它。需要换群时，粘贴新的 Webhook 再保存。
                </div>
              </el-form-item>

              <el-form-item label="签名密钥">
                <el-input
                  v-model="webhookForm.webhookSecret"
                  type="password"
                  show-password
                  placeholder="飞书机器人未开启签名校验就留空"
                  spellcheck="false"
                  clearable
                />
                <div class="form-hint">
                  只有飞书机器人安全设置里开启了"签名校验"才需要填 Secret。
                  <span v-if="webhookSettings?.webhookSecretConfigured">
                    当前已保存 Secret；留空保存不会覆盖它。
                  </span>
                </div>
              </el-form-item>

              <el-form-item label="通知开关">
                <el-switch v-model="webhookForm.enabled" active-text="启用" inactive-text="暂停" />
              </el-form-item>

              <el-form-item label="推送类型">
                <el-checkbox-group v-model="webhookForm.notifyTypes" class="type-grid">
                  <el-checkbox-button
                    v-for="item in notifyTypeOptions"
                    :key="item.value"
                    :label="item.value"
                  >
                    {{ item.label }}
                  </el-checkbox-button>
                </el-checkbox-group>
                <div class="form-hint">不选择时，后端会推送全部通知类型。</div>
              </el-form-item>

              <div v-if="webhookTestMessage" class="test-result" :class="webhookTestResultClass">
                {{ webhookTestMessage }}
              </div>

              <div class="form-actions">
                <el-button type="primary" :loading="saving" @click="saveWebhookSettings">
                  <el-icon><Check /></el-icon>
                  保存绑定
                </el-button>
                <el-button
                  :loading="testing"
                  :disabled="!webhookSettings?.configured"
                  @click="sendWebhookTest"
                >
                  <el-icon><Promotion /></el-icon>
                  发送测试
                </el-button>
              </div>
            </el-form>
          </div>

          <aside class="guide-panel">
            <div class="section-title">
              <el-icon><Link /></el-icon>
              <span>快速指南</span>
            </div>
            <div class="tips-list">
              <div class="tip-item">
                <strong>1. 添加自定义机器人</strong>
                <p>飞书群设置 → 群机器人 → 添加自定义机器人。</p>
              </div>
              <div class="tip-item">
                <strong>2. 复制 Webhook URL</strong>
                <p>格式为 https://open.feishu.cn/open-apis/bot/v2/hook/...</p>
              </div>
              <div class="tip-item">
                <strong>3. 粘贴并测试</strong>
                <p>粘贴到上方输入框，保存后点"发送测试"。</p>
              </div>
              <div class="tip-item">
                <strong>签名错误</strong>
                <p>填对 Secret，或关闭机器人签名校验。</p>
              </div>
              <div class="tip-item">
                <strong>关键词不匹配</strong>
                <p>如果开了关键词限制，关键词建议填 MatrixFlow。</p>
              </div>
            </div>
          </aside>
        </section>
      </template>

      <!-- ═══════════════ App 模式 ═══════════════ -->

      <template v-if="activeMode === 'app'">
        <section class="status-strip" :class="{ 'status-strip--enabled': appSettings?.configured }">
          <div class="status-strip__icon">
            <el-icon>
              <CircleCheck v-if="appSettings?.configured" />
              <WarningFilled v-else />
            </el-icon>
          </div>
          <div class="status-strip__body">
            <div class="status-strip__title">
              {{ appSettings?.configured ? '应用机器人已连接' : '应用机器人未配置' }}
            </div>
            <div class="status-strip__text">
              {{
                appSettings?.configured
                  ? `通知已${appSettings.enabled ? '启用' : '暂停'}，App ID：${appSettings.appId}，接收人：${appSettings.receiveIdType}=${appSettings.receiveId}`
                  : '在飞书开发者后台创建应用、开启机器人能力，然后填入 App ID 和 App Secret。'
              }}
            </div>
          </div>
          <el-tag :type="appSettings?.enabled ? 'success' : 'info'" effect="dark">
            {{ appSettings?.enabled ? '启用中' : '已暂停' }}
          </el-tag>
        </section>

        <section class="settings-panel">
          <div class="settings-panel__main">
            <div class="section-title">
              <el-icon><Connection /></el-icon>
              <span>应用机器人配置</span>
            </div>

            <el-alert
              class="mode-alert"
              type="info"
              :closable="false"
              show-icon
              title="应用机器人模式通过飞书 OpenAPI 发送消息，支持给个人发私信、发交互式消息卡片。需要在飞书开发者后台创建应用。"
            />

            <el-alert
              v-if="appSettings && !appSettings.envFileWritable"
              class="mode-alert"
              type="warning"
              :closable="false"
              show-icon
              title="服务器 .env 文件不可写，保存的设置在服务重启后会丢失。请联系管理员修复文件权限。"
            />

            <el-form label-position="top" class="settings-form" @submit.prevent>
              <el-form-item label="App ID">
                <el-input
                  v-model="appForm.appId"
                  placeholder="cli_xxxxxxxxxxxxxxxx"
                  spellcheck="false"
                  clearable
                />
                <div class="form-hint">
                  在飞书开发者后台 → 应用详情 → 凭证与基础信息中获取。
                  <span v-if="appSettings?.appId">
                    当前已保存 App ID：{{ appSettings.appId }}
                  </span>
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
                <div class="form-hint">
                  <span v-if="appSettings?.appSecretConfigured">
                    当前已保存 Secret；留空保存不会覆盖它。
                  </span>
                  <span v-else> 在飞书开发者后台 → 凭证与基础信息中获取。 </span>
                </div>
              </el-form-item>

              <el-form-item label="接收人类型">
                <el-radio-group v-model="appForm.receiveIdType">
                  <el-radio-button label="open_id">Open ID</el-radio-button>
                  <el-radio-button label="user_id">User ID</el-radio-button>
                  <el-radio-button label="union_id">Union ID</el-radio-button>
                  <el-radio-button label="email">邮箱</el-radio-button>
                  <el-radio-button label="chat_id">群 Chat ID</el-radio-button>
                </el-radio-group>
                <div class="form-hint">
                  {{ receiveIdTypeHint }}
                </div>
              </el-form-item>

              <el-form-item label="接收人 ID">
                <el-input
                  v-model="appForm.receiveId"
                  :placeholder="receiveIdPlaceholder"
                  spellcheck="false"
                  clearable
                />
                <div class="form-hint">
                  {{ receiveIdHint }}
                </div>
              </el-form-item>

              <el-form-item label="通知开关">
                <el-switch v-model="appForm.enabled" active-text="启用" inactive-text="暂停" />
              </el-form-item>

              <el-form-item label="推送类型">
                <el-checkbox-group v-model="appForm.notifyTypes" class="type-grid">
                  <el-checkbox-button
                    v-for="item in notifyTypeOptions"
                    :key="item.value"
                    :label="item.value"
                  >
                    {{ item.label }}
                  </el-checkbox-button>
                </el-checkbox-group>
                <div class="form-hint">不选择时，后端会推送全部通知类型。</div>
              </el-form-item>

              <div v-if="appTestMessage" class="test-result" :class="appTestResultClass">
                {{ appTestMessage }}
              </div>

              <div class="form-actions">
                <el-button type="primary" :loading="saving" @click="saveAppSettings">
                  <el-icon><Check /></el-icon>
                  保存配置
                </el-button>
                <el-button
                  :loading="testing"
                  :disabled="!appSettings?.configured"
                  @click="sendAppTest"
                >
                  <el-icon><Promotion /></el-icon>
                  发送测试卡片
                </el-button>
              </div>
            </el-form>
          </div>

          <aside class="guide-panel">
            <div class="section-title">
              <el-icon><Connection /></el-icon>
              <span>配置指南</span>
            </div>
            <div class="tips-list">
              <div class="tip-item">
                <strong>1. 创建应用</strong>
                <p>
                  打开
                  <a href="https://open.feishu.cn/app" target="_blank" rel="noopener"
                    >飞书开发者后台</a
                  >
                  ，点击「创建企业自建应用」。
                </p>
              </div>
              <div class="tip-item">
                <strong>2. 开启机器人能力</strong>
                <p>应用详情 → 添加应用能力 → 机器人。开启后需要发布新版本。</p>
              </div>
              <div class="tip-item">
                <strong>3. 配置权限</strong>
                <p>
                  权限管理 → 申请权限 → 搜索并开通：
                  <code>im:message</code>（发送消息给用户）。
                </p>
              </div>
              <div class="tip-item">
                <strong>4. 获取 App ID / Secret</strong>
                <p>凭证与基础信息页面，复制 App ID 和 App Secret 到这里。</p>
              </div>
              <div class="tip-item">
                <strong>5. 设置接收人</strong>
                <p>
                  私信：填用户的 open_id（通讯录 API 获取）。<br />
                  群聊：填 chat_id（群设置 → 群信息中获取），并把机器人加入群。
                </p>
              </div>
              <div class="tip-item">
                <strong>6. 发布应用</strong>
                <p>所有配置完成后，需要在开发者后台发布新版本，应用才会生效。</p>
              </div>
              <div class="tip-item">
                <strong>用户不在可用范围</strong>
                <p>确保接收人在应用的可用范围内（应用详情 → 可用范围）。</p>
              </div>
              <div class="tip-item">
                <strong>权限不足 99991672</strong>
                <p>检查是否已申请 <code>im:message</code> 权限并审批通过。</p>
              </div>
              <div class="tip-item">
                <strong>消息卡片效果</strong>
                <p>应用机器人模式会发送带颜色标题、分栏内容的交互式消息卡片，比纯文本更好看。</p>
              </div>
            </div>
          </aside>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Bell,
  Check,
  CircleCheck,
  Connection,
  Link,
  Promotion,
  Refresh,
  WarningFilled,
} from '@element-plus/icons-vue'
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
const activeMode = ref<'webhook' | 'app'>('webhook')

// ── Webhook state ──────────────────────────────────────

const webhookSettings = ref<FeishuSettings | null>(null)
const webhookTestMessage = ref('')
const webhookTestOk = ref(false)

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
const appTestMessage = ref('')
const appTestOk = ref(false)

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

const webhookTestResultClass = computed(() => ({
  'test-result--ok': webhookTestOk.value,
  'test-result--fail': !webhookTestOk.value,
}))

const appTestResultClass = computed(() => ({
  'test-result--ok': appTestOk.value,
  'test-result--fail': !appTestOk.value,
}))

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

const receiveIdTypeHint = computed(() => {
  switch (appForm.receiveIdType) {
    case 'open_id':
      return 'Open ID 是飞书用户的唯一标识，可通过通讯录 API 获取。'
    case 'user_id':
      return 'User ID 是应用范围内的用户标识。'
    case 'union_id':
      return 'Union ID 是跨应用的用户唯一标识。'
    case 'email':
      return '直接用飞书注册邮箱发送。'
    case 'chat_id':
      return '群聊 ID，机器人需已加入该群。在群设置 → 群信息中获取。'
    default:
      return ''
  }
})

const receiveIdHint = computed(() => {
  if (appForm.receiveIdType === 'chat_id') {
    return '确保机器人已加入目标群聊，且群内有发言权限。'
  }
  if (appForm.receiveIdType === 'email') {
    return '接收人需要是飞书注册用户，且在应用可用范围内。'
  }
  return '接收人需要在应用的可用范围内（开发者后台 → 应用详情 → 可用范围）。'
})

// ── Lifecycle ──────────────────────────────────────────

onMounted(() => {
  loadSettings()
})

watch(activeMode, () => {
  webhookTestMessage.value = ''
  appTestMessage.value = ''
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

    // 自动切换到已配置的模式
    if (appRes.data.mode === 'app' && appRes.data.configured) {
      activeMode.value = 'app'
    } else if (webhookRes.data.mode === 'webhook' && webhookRes.data.configured) {
      activeMode.value = 'webhook'
    }
  } finally {
    loading.value = false
  }
}

// ── Webhook actions ────────────────────────────────────

async function saveWebhookSettings() {
  const webhookUrl = webhookForm.webhookUrl.trim()
  if (!webhookUrl && !webhookSettings.value?.configured) {
    ElMessage.warning('请填写飞书 Webhook URL')
    return
  }

  saving.value = true
  webhookTestMessage.value = ''
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
    ElMessage.success('飞书通知已保存，可以发送测试')
  } catch (error) {
    ElMessage.error(explainError(error, '飞书通知保存失败'))
  } finally {
    saving.value = false
  }
}

async function sendWebhookTest() {
  testing.value = true
  try {
    const res = await notificationApi.testFeishu()
    webhookTestOk.value = res.data.sent
    webhookTestMessage.value = res.data.sent
      ? '测试通知已发送。请到飞书群里确认是否收到 MatrixFlow 消息。'
      : explainFeishuFailure(res.data.message)

    if (res.data.sent) {
      ElMessage.success('测试通知已发送')
    } else {
      ElMessage.warning(webhookTestMessage.value)
    }
  } catch (error) {
    webhookTestOk.value = false
    webhookTestMessage.value = explainError(error, '测试通知发送失败')
    ElMessage.error(webhookTestMessage.value)
  } finally {
    testing.value = false
  }
}

// ── App actions ────────────────────────────────────────

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
  appTestMessage.value = ''
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
    ElMessage.success('应用机器人配置已保存，可以发送测试')
  } catch (error) {
    ElMessage.error(explainError(error, '应用机器人配置保存失败'))
  } finally {
    saving.value = false
  }
}

async function sendAppTest() {
  testing.value = true
  try {
    const res = await notificationApi.testFeishuApp()
    appTestOk.value = res.data.sent
    appTestMessage.value = res.data.sent
      ? '测试卡片已发送。请到飞书查看是否收到 MatrixFlow 交互式卡片消息。'
      : explainAppFailure(res.data.message)

    if (res.data.sent) {
      ElMessage.success('测试卡片已发送')
    } else {
      ElMessage.warning(appTestMessage.value)
    }
  } catch (error) {
    appTestOk.value = false
    appTestMessage.value = explainError(error, '测试卡片发送失败')
    ElMessage.error(appTestMessage.value)
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
  if (!message) return '测试通知未发送，请检查 Webhook 是否正确。'
  if (message.includes('FEISHU_WEBHOOK_URL')) return '还没有保存 Webhook URL。'
  if (message.includes('19021') || message.includes('sign') || message.includes('signature')) {
    return '飞书拒收：签名校验失败。请检查 Secret，或关闭机器人签名校验。'
  }
  if (message.includes('19024') || /key\s*words?/i.test(message) || message.includes('关键词')) {
    return '飞书拒收：关键词不匹配。建议机器人关键词填 MatrixFlow。'
  }
  if (message.includes('19022') || /ip\s*not\s*allowed/i.test(message)) {
    return '飞书拒收：服务器出口 IP 不在机器人白名单。'
  }
  if (message.includes('11232') || message.includes('rate') || message.includes('限流')) {
    return '飞书限流：单机器人限制 5 次/秒、100 次/分钟，稍后再试。'
  }
  return `飞书返回：${message}`
}

function explainAppFailure(message = '') {
  if (!message) return '测试卡片未发送，请检查 App ID / Secret / 接收人是否正确。'
  if (message.includes('FEISHU_APP_ID') || message.includes('FEISHU_APP_SECRET')) {
    return '还没有配置 App ID 或 App Secret。'
  }
  if (message.includes('FEISHU_RECEIVE_ID')) {
    return '还没有配置接收人 ID。'
  }
  if (message.includes('99991663') || message.includes('token')) {
    return 'tenant_access_token 获取失败：请检查 App ID 和 App Secret 是否正确。'
  }
  if (message.includes('99991672') || message.includes('permission')) {
    return '权限不足：请在飞书开发者后台申请 im:message 权限并审批通过。'
  }
  if (message.includes('230001') || message.includes('not exist') || message.includes('chat_id')) {
    return '接收人不存在：请检查接收人 ID 是否正确，机器人是否已加入群聊。'
  }
  if (message.includes('230002') || message.includes('range') || message.includes('scope')) {
    return '接收人不在应用可用范围内：请在开发者后台 → 可用范围中添加。'
  }
  if (message.includes('rate') || message.includes('限流')) {
    return '飞书限流：单个用户/群 5 QPS，稍后再试。'
  }
  return `飞书返回：${message}`
}

function explainError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
</script>

<style lang="scss" scoped>
.feishu-settings {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px;
  color: $text-primary;

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;

    h2 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      font-weight: 700;
    }

    p {
      margin: 8px 0 0;
      color: $text-secondary;
      font-size: 14px;
    }
  }
}

// ── Mode switcher ──────────────────────────────────────

.mode-switcher {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.mode-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 2px solid $border-subtle;
  border-radius: $radius-md;
  background: $bg-elevated;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background 0.2s;
  position: relative;

  &:hover {
    border-color: rgba(99, 102, 241, 0.4);
  }

  &--active {
    border-color: $accent-300;
    background: rgba(99, 102, 241, 0.06);
  }

  &__icon {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-sm;
    background: rgba(99, 102, 241, 0.12);
    color: $accent-300;
    font-size: 20px;
    flex-shrink: 0;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  &__desc {
    margin-top: 4px;
    font-size: 12px;
    color: $text-secondary;
    line-height: 1.4;
  }

  &__check {
    position: absolute;
    top: 12px;
    right: 12px;
    color: $color-success;
    font-size: 18px;
  }
}

// ── Status strip ───────────────────────────────────────

.status-strip,
.settings-panel {
  border: 1px solid $border-subtle;
  background: $bg-elevated;
  box-shadow: $shadow-sm;
}

.status-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border-radius: $radius-md;
  margin-bottom: 16px;

  &--enabled {
    border-color: rgba(16, 185, 129, 0.28);
    background: rgba(16, 185, 129, 0.08);
  }

  &__icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $radius-sm;
    color: $color-warning;
    background: rgba(245, 158, 11, 0.12);
    flex-shrink: 0;
  }

  &--enabled &__icon {
    color: $color-success;
    background: rgba(16, 185, 129, 0.14);
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
  }

  &__text {
    margin-top: 4px;
    color: $text-secondary;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
}

// ── Settings panel ─────────────────────────────────────

.settings-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 24px;
  padding: 20px;
  border-radius: $radius-md;

  &__main {
    min-width: 0;
  }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  color: $text-primary;
  font-size: 14px;
  font-weight: 700;
}

.mode-alert {
  margin-bottom: 18px;
}

.settings-form {
  :deep(.el-form-item__label) {
    color: $text-secondary;
    font-weight: 600;
  }
}

.form-hint {
  margin-top: 6px;
  color: $text-tertiary;
  font-size: 12px;
  line-height: 1.6;

  code {
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(99, 102, 241, 0.12);
    color: $accent-300;
    font-size: 11px;
  }
}

.type-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;

  :deep(.el-checkbox-button__inner) {
    border-left: 1px solid var(--el-border-color);
    border-radius: $radius-sm;
  }
}

.test-result {
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: $radius-sm;
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
}

.form-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.guide-panel {
  border-left: 1px solid $border-subtle;
  padding-left: 24px;
  color: $text-secondary;
}

.tips-list {
  display: grid;
  gap: 14px;
}

.tip-item {
  strong {
    display: block;
    color: $text-primary;
    font-size: 13px;
  }

  p {
    margin: 5px 0 0;
    color: $text-secondary;
    font-size: 12px;
    line-height: 1.6;

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

@media (max-width: 860px) {
  .feishu-settings {
    padding: 18px;
  }

  .feishu-settings__header,
  .status-strip {
    align-items: stretch;
    flex-direction: column;
  }

  .mode-switcher,
  .settings-panel {
    grid-template-columns: 1fr;
  }

  .guide-panel {
    border-left: 0;
    border-top: 1px solid $border-subtle;
    padding: 20px 0 0;
  }
}
</style>
