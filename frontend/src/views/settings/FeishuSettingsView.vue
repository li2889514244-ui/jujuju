<template>
  <div class="feishu-settings">
    <div class="feishu-settings__header">
      <div>
        <h2>飞书通知</h2>
        <p>绑定飞书群机器人，把系统通知同步到指定群聊。</p>
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
                : '填写飞书自定义机器人的 Webhook URL 后保存。'
            }}
          </div>
        </div>
        <el-tag :type="settings?.enabled ? 'success' : 'info'" effect="dark">
          {{ settings?.enabled ? '启用中' : '已暂停' }}
        </el-tag>
      </section>

      <section class="settings-panel">
        <div class="settings-panel__main">
          <div class="section-title">
            <el-icon><Bell /></el-icon>
            <span>机器人绑定</span>
          </div>

          <el-form label-position="top" class="settings-form" @submit.prevent>
            <el-form-item label="Webhook URL">
              <el-input
                v-model="form.webhookUrl"
                placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
                spellcheck="false"
              />
              <div v-if="settings?.configured" class="form-hint">
                当前已保存 Webhook；留空保存不会覆盖它。
              </div>
            </el-form-item>

            <el-form-item label="签名密钥">
              <el-input
                v-model="form.webhookSecret"
                type="password"
                show-password
                placeholder="未开启签名校验可留空"
                spellcheck="false"
              />
              <div v-if="settings?.webhookSecretConfigured" class="form-hint">
                当前已保存签名密钥；留空保存不会覆盖它。
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
              <div class="form-hint">不选择时，后端会推送全部通知类型。</div>
            </el-form-item>

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
            <span>飞书里这样拿地址</span>
          </div>
          <ol>
            <li>打开接收通知的飞书群。</li>
            <li>进入群设置，添加自定义机器人。</li>
            <li>复制 Webhook URL，按需开启签名校验。</li>
            <li>回到这里保存，然后发送测试通知。</li>
          </ol>
          <div class="guide-panel__note">
            Secret 不会在页面回显。需要更换时，重新输入并保存即可。
          </div>
        </aside>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
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
    ElMessage.success('飞书通知已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '飞书通知保存失败')
  } finally {
    saving.value = false
  }
}

async function sendTest() {
  testing.value = true
  try {
    const res = await notificationApi.testFeishu()
    if (res.data.sent) {
      ElMessage.success('测试通知已发送')
    } else {
      ElMessage.warning(res.data.message || '测试通知未发送')
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '测试通知发送失败')
  } finally {
    testing.value = false
  }
}

function applySettings(next: FeishuSettings) {
  settings.value = next
  form.enabled = next.enabled
  form.notifyTypes = next.notifyTypes.length ? next.notifyTypes : []
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

  ol {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 10px;
    font-size: 13px;
    line-height: 1.6;
  }

  &__note {
    margin-top: 18px;
    padding: 12px;
    border-radius: $radius-sm;
    background: rgba(99, 102, 241, 0.08);
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
