<template>
  <div class="mcp-access">
    <div class="mcp-access__header">
      <div>
        <h2>MCP 接入</h2>
        <p>把矩阵数据以只读 MCP 服务开放给外部 AI 客户端。</p>
      </div>
      <el-button :loading="loading" @click="loadAll">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <el-skeleton v-if="loading && !info" :rows="8" animated />

    <template v-else>
      <!-- 状态条 -->
      <section class="status-strip" :class="{ 'status-strip--enabled': info?.enabled }">
        <div class="status-strip__icon">
          <el-icon>
            <CircleCheck v-if="info?.enabled" />
            <WarningFilled v-else />
          </el-icon>
        </div>
        <div class="status-strip__body">
          <div class="status-strip__title">
            {{ info?.enabled ? 'MCP 已启用' : 'MCP 未启用' }}
          </div>
          <div class="status-strip__text">
            {{
              info?.enabled
                ? `已配置 ${info.auth.keyCount} 个 key，支持 ${info.transports?.join(' / ') || 'streamable-http'} 传输`
                : '还没有配置 MCP key，请在下方创建一个 key。'
            }}
          </div>
        </div>
      </section>

      <!-- 连接地址 -->
      <section class="connection-panel">
        <div class="connection-panel__main">
          <div class="section-title">
            <el-icon><Link /></el-icon>
            <span>连接地址</span>
          </div>
          <div class="copy-row">
            <el-input :model-value="endpoint" readonly spellcheck="false" />
            <el-button type="primary" @click="copy(endpoint)">
              <el-icon><CopyDocument /></el-icon>
              复制
            </el-button>
          </div>
          <div class="meta-grid">
            <div>
              <span>传输协议</span>
              <strong>{{ info?.transports?.join(' / ') || 'streamable-http' }}</strong>
            </div>
            <div>
              <span>认证方式</span>
              <strong>Bearer token</strong>
            </div>
            <div>
              <span>单次最多行数</span>
              <strong>{{ info?.limits?.maxRows || 500 }}</strong>
            </div>
            <div>
              <span>最大日期范围</span>
              <strong>{{ info?.limits?.maxRangeDays || 366 }} 天</strong>
            </div>
          </div>
        </div>
      </section>

      <!-- Key 管理 -->
      <section class="keys-panel">
        <div class="section-title">
          <el-icon><Key /></el-icon>
          <span>Key 管理</span>
        </div>

        <!-- 创建 Key -->
        <div class="create-key-row">
          <el-input
            v-model="newClientId"
            placeholder="客户端名称，如 cursor、claude、cherry-studio"
            maxlength="40"
            class="create-key-row__input"
            @keyup.enter="handleCreateKey"
          />
          <el-button type="primary" :loading="creating" @click="handleCreateKey">
            <el-icon><Plus /></el-icon>
            新建 Key
          </el-button>
        </div>

        <!-- Key 列表 -->
        <div class="key-list">
          <div v-for="key in allKeys" :key="key.id" class="key-item">
            <div class="key-item__info">
              <span class="key-item__client">{{ key.clientId }}</span>
              <span class="key-item__token">{{ key.token }}</span>
              <el-tag :type="key.source === 'db' ? 'success' : 'info'" size="small">
                {{ key.source === 'db' ? '数据库' : '环境变量' }}
              </el-tag>
            </div>
            <div class="key-item__actions">
              <el-button text size="small" @click="copy(key.token)">
                <el-icon><CopyDocument /></el-icon>
                复制 Token
              </el-button>
              <el-button text size="small" @click="selectKey(key.token)">
                <el-icon><Select /></el-icon>
                用于配置
              </el-button>
              <el-button
                v-if="key.source === 'db'"
                text
                size="small"
                type="danger"
                @click="handleDeleteKey(key)"
              >
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </div>
          </div>
          <div v-if="allKeys.length === 0" class="key-list__empty">
            暂无 MCP key，请在上方创建一个。
          </div>
        </div>
      </section>

      <!-- 客户端配置指引 -->
      <section class="config-panel">
        <div class="section-title">
          <el-icon><Connection /></el-icon>
          <span>AI 客户端配置</span>
        </div>
        <p class="hint">
          选择一个客户端类型，复制对应配置并粘贴到客户端的 MCP 设置中。
          <code>token</code> 会自动使用你刚才"用于配置"选中的 key（或第一个 key）。
        </p>

        <el-tabs v-model="activeTab" class="config-tabs">
          <el-tab-pane label="Cursor" name="cursor">
            <pre class="code-block">{{ cursorConfig }}</pre>
            <el-button @click="copy(cursorConfig)">
              <el-icon><CopyDocument /></el-icon>
              复制配置
            </el-button>
          </el-tab-pane>

          <el-tab-pane label="Claude Desktop" name="claude">
            <p class="tab-hint">
              Claude Desktop 不支持远程 HTTP MCP，需要通过
              <code>mcp-remote</code> 做本地桥接。确保已安装 Node.js。
            </p>
            <pre class="code-block">{{ claudeConfig }}</pre>
            <el-button @click="copy(claudeConfig)">
              <el-icon><CopyDocument /></el-icon>
              复制配置
            </el-button>
          </el-tab-pane>

          <el-tab-pane label="Cline / VS Code" name="cline">
            <pre class="code-block">{{ clineConfig }}</pre>
            <el-button @click="copy(clineConfig)">
              <el-icon><CopyDocument /></el-icon>
              复制配置
            </el-button>
          </el-tab-pane>

          <el-tab-pane label="SSE (Cherry Studio 等)" name="sse">
            <p class="tab-hint">
              部分国产 AI 客户端（如 Cherry Studio）使用旧版 SSE 传输协议。 请用以下地址配置：
            </p>
            <pre class="code-block">{{ sseConfig }}</pre>
            <el-button @click="copy(sseConfig)">
              <el-icon><CopyDocument /></el-icon>
              复制配置
            </el-button>
          </el-tab-pane>

          <el-tab-pane label="通用 HTTP / curl" name="curl">
            <p class="tab-hint">
              手动测试连接，先用 initialize 初始化，再用 tools/list 查看可用工具：
            </p>
            <pre class="code-block">{{ curlExample }}</pre>
            <el-button @click="copy(curlExample)">
              <el-icon><CopyDocument /></el-icon>
              复制命令
            </el-button>
          </el-tab-pane>
        </el-tabs>
      </section>

      <!-- 可用工具 -->
      <section class="catalog-panel">
        <div class="catalog-panel__column">
          <div class="section-title">
            <el-icon><DataAnalysis /></el-icon>
            <span>可用工具</span>
          </div>
          <div class="catalog-list">
            <div v-for="tool in info?.tools || []" :key="tool.name" class="catalog-item">
              <strong>{{ tool.name }}</strong>
              <span>{{ tool.title }}</span>
            </div>
          </div>
        </div>
        <div class="catalog-panel__column">
          <div class="section-title">
            <el-icon><DocumentCopy /></el-icon>
            <span>可读资源</span>
          </div>
          <div class="catalog-list">
            <div
              v-for="resource in info?.resources || []"
              :key="resource.name"
              class="catalog-item"
            >
              <strong>{{ resource.description }}</strong>
              <span>{{ resource.title }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  Connection,
  CopyDocument,
  DataAnalysis,
  Delete,
  DocumentCopy,
  Key,
  Link,
  Plus,
  Refresh,
  Select,
  WarningFilled,
} from '@element-plus/icons-vue'
import { mcpApi, type McpConnectionInfo, type McpKey } from '@/api/mcp'

const loading = ref(false)
const creating = ref(false)
const info = ref<McpConnectionInfo | null>(null)
const keys = ref<McpKey[]>([])
const selectedToken = ref<string>('')
const newClientId = ref('')
const activeTab = ref('cursor')

const allKeys = computed(() => keys.value)

const activeToken = computed(() => selectedToken.value || keys.value[0]?.token || '<MCP key>')
const endpoint = computed(() => info.value?.endpoint || getFallbackEndpoint())
const sseEndpoint = computed(() => info.value?.sseEndpoint || `${getFallbackBaseUrl()}/mcp/sse`)
const messagesEndpoint = computed(
  () => info.value?.messagesEndpoint || `${getFallbackBaseUrl()}/mcp/messages`,
)

const cursorConfig = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        matrixflow: {
          url: endpoint.value,
          headers: {
            Authorization: `Bearer ${activeToken.value}`,
          },
        },
      },
    },
    null,
    2,
  ),
)

const claudeConfig = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        matrixflow: {
          command: 'npx',
          args: [
            'mcp-remote',
            endpoint.value,
            '--header',
            `Authorization: Bearer ${activeToken.value}`,
          ],
        },
      },
    },
    null,
    2,
  ),
)

const clineConfig = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        matrixflow: {
          type: 'http',
          url: endpoint.value,
          headers: {
            Authorization: `Bearer ${activeToken.value}`,
          },
        },
      },
    },
    null,
    2,
  ),
)

const sseConfig = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        matrixflow: {
          type: 'sse',
          url: sseEndpoint.value,
          headers: {
            Authorization: `Bearer ${activeToken.value}`,
          },
        },
      },
    },
    null,
    2,
  ),
)

const curlExample = computed(
  () =>
    `# 1. 初始化连接\ncurl -X POST ${endpoint.value} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "Authorization: Bearer ${activeToken.value}" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'\n\n# 2. 列出工具\ncurl -X POST ${endpoint.value} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -H "Authorization: Bearer ${activeToken.value}" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'\n\n# SSE 方式（旧客户端）:\n# GET  ${sseEndpoint.value}  (建立 SSE 连接)\n# POST ${messagesEndpoint.value}?sessionId=<id>  (发送消息)`,
)

onMounted(() => {
  loadAll()
})

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([loadConnectionInfo(), loadKeys()])
  } finally {
    loading.value = false
  }
}

async function loadConnectionInfo() {
  try {
    const res = await mcpApi.getConnectionInfo()
    info.value = res.data
  } catch {
    // 静默
  }
}

async function loadKeys() {
  try {
    const res = await mcpApi.listKeys()
    keys.value = [...res.data.dbKeys, ...res.data.envKeys]
  } catch {
    // 静默
  }
}

async function handleCreateKey() {
  const clientId = newClientId.value.trim()
  if (!clientId) {
    ElMessage.warning('请输入客户端名称')
    return
  }

  creating.value = true
  try {
    const res = await mcpApi.createKey(clientId)
    keys.value.unshift(res.data)
    selectedToken.value = res.data.token
    ElMessage.success(`已创建 key: ${res.data.clientId}`)
    newClientId.value = ''
    await loadConnectionInfo()
  } catch {
    ElMessage.error('创建 key 失败')
  } finally {
    creating.value = false
  }
}

async function handleDeleteKey(key: McpKey) {
  try {
    await ElMessageBox.confirm(
      `确定要删除 key "${key.clientId}" 吗？删除后使用该 key 的 AI 客户端将无法连接。`,
      '删除确认',
      { type: 'warning' },
    )
    await mcpApi.deleteKey(key.id)
    keys.value = keys.value.filter((k) => k.id !== key.id)
    if (selectedToken.value === key.token) {
      selectedToken.value = ''
    }
    ElMessage.success('已删除')
    await loadConnectionInfo()
  } catch {
    // 取消
  }
}

function selectKey(token: string) {
  selectedToken.value = token
  ElMessage.success('已选中该 key，下方配置将使用它')
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  ElMessage.success('已复制')
}

function getFallbackBaseUrl() {
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  const baseUrl = new URL(apiBase, window.location.origin).toString().replace(/\/$/, '')
  return baseUrl
}

function getFallbackEndpoint() {
  return `${getFallbackBaseUrl()}/mcp`
}
</script>

<style lang="scss" scoped>
.mcp-access {
  max-width: 1180px;
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
      color: $text-tertiary;
      font-size: 14px;
    }
  }
}

.status-strip,
.connection-panel,
.keys-panel,
.config-panel,
.catalog-panel {
  border: 1px solid $border-base;
  background: rgba(255, 255, 255, 0.025);
  border-radius: 8px;
}

.status-strip {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  margin-bottom: 16px;
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(245, 158, 11, 0.07);

  &--enabled {
    border-color: rgba(16, 185, 129, 0.3);
    background: rgba(16, 185, 129, 0.07);
  }

  &__icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: $color-warning;
    background: rgba(245, 158, 11, 0.12);
    flex-shrink: 0;
  }

  &--enabled &__icon {
    color: $color-success;
    background: rgba(16, 185, 129, 0.12);
  }

  &__title {
    font-size: 15px;
    font-weight: 700;
  }

  &__text {
    margin-top: 3px;
    color: $text-secondary;
    font-size: 13px;
  }
}

.connection-panel {
  padding: 18px;
  margin-bottom: 16px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  color: $text-primary;
  font-size: 14px;
  font-weight: 700;

  .el-icon {
    color: $color-info;
  }
}

.copy-row {
  display: flex;
  gap: 10px;

  .el-input {
    flex: 1;
    min-width: 0;
  }

  .el-button {
    flex-shrink: 0;
  }
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;

  div {
    padding: 12px;
    border: 1px solid $border-subtle;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
  }

  span,
  strong {
    display: block;
  }

  span {
    color: $text-tertiary;
    font-size: 12px;
  }

  strong {
    margin-top: 5px;
    color: $text-primary;
    font-size: 14px;
    font-weight: 650;
    word-break: break-word;
  }
}

.keys-panel {
  padding: 18px;
  margin-bottom: 16px;
}

.create-key-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;

  &__input {
    flex: 1;
  }
}

.key-list {
  display: grid;
  gap: 8px;

  &__empty {
    padding: 20px;
    text-align: center;
    color: $text-tertiary;
    font-size: 13px;
  }
}

.key-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid $border-subtle;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);

  &__info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  &__client {
    font-weight: 600;
    font-size: 13px;
    color: $text-primary;
    flex-shrink: 0;
  }

  &__token {
    font-family: $font-mono;
    font-size: 12px;
    color: $text-tertiary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  &__actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
}

.config-panel {
  padding: 18px;
  margin-bottom: 16px;
}

.hint {
  margin: 10px 0 12px;
  color: $text-secondary;
  font-size: 13px;
  line-height: 1.65;

  code {
    color: $accent-200;
    font-family: $font-mono;
  }
}

.tab-hint {
  margin: 8px 0 12px;
  color: $text-tertiary;
  font-size: 13px;
  line-height: 1.6;

  code {
    color: $accent-200;
    font-family: $font-mono;
  }
}

.config-tabs {
  margin-top: 8px;
}

.code-block {
  min-height: 92px;
  max-height: 320px;
  margin: 0 0 12px;
  padding: 14px;
  overflow: auto;
  border: 1px solid rgba(6, 182, 212, 0.18);
  border-radius: 8px;
  background: rgba(6, 182, 212, 0.055);
  color: $text-primary;
  font-family: $font-mono;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.catalog-panel {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: 16px;
  padding: 18px;

  &__column {
    min-width: 0;
  }
}

.catalog-list {
  display: grid;
  gap: 8px;
}

.catalog-item {
  display: grid;
  gap: 4px;
  min-height: 58px;
  padding: 11px 12px;
  border: 1px solid $border-subtle;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);

  strong {
    color: $text-primary;
    font-family: $font-mono;
    font-size: 12px;
    word-break: break-word;
  }

  span {
    color: $text-tertiary;
    font-size: 12px;
    line-height: 1.45;
  }
}

@media (max-width: 960px) {
  .mcp-access {
    padding: 18px;
  }

  .meta-grid,
  .catalog-panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .mcp-access__header,
  .copy-row,
  .create-key-row,
  .key-item {
    flex-direction: column;
    align-items: stretch;
  }

  .key-item__info {
    flex-direction: column;
    align-items: flex-start;
  }

  .copy-row .el-button,
  .create-key-row .el-button {
    width: 100%;
  }
}
</style>
