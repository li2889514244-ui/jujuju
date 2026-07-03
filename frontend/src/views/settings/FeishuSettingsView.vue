<template>
  <div class="feishu-settings">
    <div class="feishu-settings__header">
      <div>
        <h2>飞书通知</h2>
        <p>用飞书群机器人接收网站通知，不需要配置飞书 CLI 或 MCP。</p>
      </div>
      <el-button :loading="loading" @click="loadSettings">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <el-skeleton v-if="loading && !settings" :rows="8" animated />

    <template v-else>
      <section class="status-strip" :class="{ 'status-strip--enabled': settings?.configured }">
        <div class="status-strip__icon">
          <el-icon>
            <CircleCheck v-if="settings?.configured" />
            <WarningFilled v-else />
          </el-icon>
        </div>
        <div class="status-strip__body">
          <div class="status-strip__title">
            {{ settings?.configured ? '飞书已绑定' : '飞书未绑定' }}
          </div>
          <div class="status-strip__text">
            {{
              settings?.configured
                ? `通知已${settings.enabled ? '启用' : '暂停'}，Webhook：${settings.webhookUrl}`
                : '先在飞书群里添加自定义机器人，然后把 Webhook URL 粘贴到这里。'
            }}
          </div>
        </div>
        <el-tag :type="settings?.enabled ? 'success' : 'info'" effect="dark">
          {{ settings?.enabled ? '启用中' : '已暂停' }}
        </el-tag>
      </section>

      <section class="quick-guide">
        <div class="quick-guide__step">
          <span>1</span>
          <strong>飞书群设置</strong>
          <p>打开接收通知的群，进入群机器人。</p>
        </div>
        <div class="quick-guide__step">
          <span>2</span>
          <strong>添加自定义机器人</strong>
          <p>复制机器人给出的 Webhook URL。</p>
        </div>
        <div class="quick-guide__step">
          <span>3</span>
          <strong>保存并测试</strong>
          <p>粘贴到下方，保存后发送测试通知。</p>
        </div>
      </section>

      <section class="settings-panel">
        <div class="settings-panel__main">
          <div class="section-title">
            <el-icon><Bell /></el-icon>
            <span>绑定机器人</span>
          </div>

          <el-alert
            class="mode-alert"
            type="info"
            :closable="false"
            show-icon
            title="这里接的是飞书群机器人 Webhook，用来发通知；不是飞书 CLI，也不是飞书 MCP。"
          />

          <el-alert
            v-if="settings && !settings.envFileWritable"
            class="mode-alert"
            type="warning"
            :closable="false"
            show-icon
            title="服务器 .env 文件不可写，保存的设置在服务重启后会丢失。请联系管理员修复文件权限。"
          />

          <el-form label-position="top" class="settings-form" @submit.prevent>
            <el-form-item label="Webhook URL">
              <el-input
                v-model="form.webhookUrl"
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                spellcheck="false"
                clearable
              />
              <div v-if="settings?.configured" class="form-hint">
                当前已保存 Webhook；留空保存不会覆盖它。需要换群时，粘贴新的 Webhook 再保存。
              </div>
            </el-form-item>

            <el-form-item label="签名密钥">
              <el-input
                v-model="form.webhookSecret"
                type="password"
                show-password
                placeholder="飞书机器人未开启签名校验就留空"
                spellcheck="false"
                clearable
              />
              <div class="form-hint">
                只有飞书机器人安全设置里开启了“签名校验”才需要填 Secret。
                <span v-if="settings?.webhookSecretConfigured">
                  当前已保存 Secret；留空保存不会覆盖它。
                </span>
              </div>
            </el-form-item>

            <el-form-item label="通知开关">
              <el-switch v-model="form.enabled" active-text="启用" inactive-text="暂停" />
            </el-form-item>

            <el-form-item label="推送类型">
              <el-checkbox-group v-model="form.notifyTypes" class="type-grid">
                <el-checkbox-button
                  v-for="item in notifyTypeOptions"
                  :key="item.value"
                  :label="item.value"
                >
                  {{ item.label }}
                </el-checkbox-button>
              </el-checkbox-group>
              <div class="form-hint">先保持默认即可；不选择时，后端会推送全部通知类型。</div>
            </el-form-item>

            <div v-if="lastTestMessage" class="test-result" :class="testResultClass">
              {{ lastTestMessage }}
            </div>

            <div class="form-actions">
              <el-button type="primary" :loading="saving" @click="saveSettings">
                <el-icon><Check /></el-icon>
                保存绑定
              </el-button>
              <el-button :loading="testing" :disabled="!settings?.configured" @click="sendTest">
                <el-icon><Promotion /></el-icon>
                发送测试
              </el-button>
            </div>
          </el-form>
        </div>

        <aside class="guide-panel">
          <div class="section-title">
            <el-icon><Link /></el-icon>
            <span>常见卡点</span>
          </div>

          <div class="tips-list">
            <div class="tip-item">
              <strong>找不到 Webhook</strong>
              <p>确认添加的是“自定义机器人”，不是飞书开放平台应用。</p>
            </div>
            <div class="tip-item">
              <strong>测试显示签名错误</strong>
              <p>要么填对 Secret，要么回飞书机器人安全设置里关闭签名校验。</p>
            </div>
            <div class="tip-item">
              <strong>飞书群没有收到</strong>
              <p>如果开启了关键词限制，关键词建议填 MatrixFlow；否则飞书会拒收。</p>
            </div>
            <div class="tip-item">
              <strong>IP 白名单拦截</strong>
              <p>如果飞书返回 Ip Not Allowed，把服务器出口 IP 加到机器人白名单。</p>
            </div>
            <div class="tip-item">
              <strong>调用太频繁</strong>
              <p>飞书限制单机器人 5 次/秒、100 次/分钟；高峰整点附近可能被限流。</p>
            </div>
            <div class="tip-item">
              <strong>保存后仍显示未绑定</strong>
              <p>点刷新再看一次；如果还不行，说明 Webhook 没有成功写入服务器配置。</p>
            </div>
          </div>
        </aside>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Bell,
  Check,
  CircleCheck,
  Link,
  Promotion,
  Refresh,
  WarningFilled,
} from '@element-plus/icons-vue'
import { notificationApi, type FeishuNotifyType, type FeishuSettings } from '@/api/notifications'

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
const settings = ref<FeishuSettings | null>(null)
const lastTestMessage = ref('')
const lastTestOk = ref(false)

const form = reactive<{
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

const testResultClass = computed(() => ({
  'test-result--ok': lastTestOk.value,
  'test-result--fail': !lastTestOk.value,
}))

onMounted(() => {
  loadSettings()
})

async function loadSettings() {
  loading.value = true
  try {
    const res = await notificationApi.getFeishuSettings()
    applySettings(res.data)
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  const webhookUrl = form.webhookUrl.trim()
  if (!webhookUrl && !settings.value?.configured) {
    ElMessage.warning('请填写飞书 Webhook URL')
    return
  }

  saving.value = true
  lastTestMessage.value = ''
  try {
    const res = await notificationApi.updateFeishuSettings({
      webhookUrl: webhookUrl || undefined,
      webhookSecret: form.webhookSecret.trim() || undefined,
      enabled: form.enabled,
      notifyTypes: form.notifyTypes,
    })
    applySettings(res.data)
    form.webhookUrl = ''
    form.webhookSecret = ''
    ElMessage.success('飞书通知已保存，可以发送测试')
  } catch (error) {
    ElMessage.error(explainError(error, '飞书通知保存失败'))
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testing.value = true
  try {
    const res = await notificationApi.testFeishu()
    lastTestOk.value = res.data.sent
    lastTestMessage.value = res.data.sent
      ? '测试通知已发送。请到飞书群里确认是否收到 MatrixFlow 消息。'
      : explainFeishuFailure(res.data.message)

    if (res.data.sent) {
      ElMessage.success('测试通知已发送')
    } else {
      ElMessage.warning(lastTestMessage.value)
    }
  } catch (error) {
    lastTestOk.value = false
    lastTestMessage.value = explainError(error, '测试通知发送失败')
    ElMessage.error(lastTestMessage.value)
  } finally {
    testing.value = false
  }
}

function applySettings(next: FeishuSettings) {
  settings.value = next
  form.enabled = next.enabled
  form.notifyTypes = next.notifyTypes.length ? next.notifyTypes : []
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
    return '飞书拒收：服务器出口 IP 不在机器人白名单。请把服务器 IP 加入飞书机器人安全设置。'
  }
  if (message.includes('11232') || message.includes('rate') || message.includes('限流')) {
    return '飞书限流：单机器人限制 5 次/秒、100 次/分钟，稍后再试。'
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
      letter-spacing: 0;
    }

    p {
      margin: 8px 0 0;
      color: $text-secondary;
      font-size: 14px;
    }
  }
}

.status-strip,
.quick-guide,
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

.quick-guide {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-bottom: 16px;
  border-radius: $radius-md;
  overflow: hidden;

  &__step {
    padding: 16px;
    background: rgba(255, 255, 255, 0.02);

    span {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 10px;
      border-radius: $radius-sm;
      background: rgba(99, 102, 241, 0.16);
      color: $accent-300;
      font-size: 12px;
      font-weight: 700;
    }

    strong {
      display: block;
      color: $text-primary;
      font-size: 14px;
    }

    p {
      margin: 6px 0 0;
      color: $text-secondary;
      font-size: 12px;
      line-height: 1.6;
    }
  }
}

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

  .quick-guide,
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
