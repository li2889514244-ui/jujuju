<template>
  <div class="mcp-access">
    <div class="mcp-access__header">
      <div>
        <h2>MCP 接入</h2>
        <p>把矩阵数据以只读 MCP 服务开放给外部 AI 客户端。</p>
      </div>
      <el-button :loading="loading" @click="loadConnectionInfo">
        <el-icon><Refresh /></el-icon>
        刷新
      </el-button>
    </div>

    <el-skeleton v-if="loading && !info" :rows="8" animated />

    <template v-else>
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
                ? `当前后端已配置 ${info.auth.keyCount} 个 MCP key。`
                : '后端还没有配置 MCP_API_KEYS，外部 AI 暂时无法读取数据。'
            }}
          </div>
        </div>
      </section>

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
              <strong>{{ info?.transport || 'streamable-http' }}</strong>
            </div>
            <div>
              <span>认证方式</span>
              <strong>Bearer token</strong>
            </div>
            <div>
              <span>单次最多行数</span>
              <strong>{{ info?.limits.maxRows || 500 }}</strong>
            </div>
            <div>
              <span>最大日期范围</span>
              <strong>{{ info?.limits.maxRangeDays || 366 }} 天</strong>
            </div>
          </div>
        </div>
      </section>

      <section class="setup-grid">
        <div class="setup-panel">
          <div class="section-title">
            <el-icon><Key /></el-icon>
            <span>生成 MCP key</span>
          </div>
          <div class="form-row">
            <label>客户端名称</label>
            <el-input v-model="clientId" maxlength="40" />
          </div>
          <div class="form-row">
            <label>新 key</label>
            <div class="copy-row">
              <el-input :model-value="generatedKey" readonly spellcheck="false" />
              <el-button @click="refreshKey">
                <el-icon><Refresh /></el-icon>
                换一个
              </el-button>
            </div>
          </div>
          <p class="hint">
            把下面这段写入后端环境变量并重启服务。已有 key 时，把新条目用英文逗号追加到
            <code>MCP_API_KEYS</code>。
          </p>
          <pre class="code-block">{{ envSnippet }}</pre>
          <el-button @click="copy(envSnippet)">
            <el-icon><CopyDocument /></el-icon>
            复制环境变量
          </el-button>
        </div>

        <div class="setup-panel">
          <div class="section-title">
            <el-icon><Connection /></el-icon>
            <span>外部 AI 配置</span>
          </div>
          <p class="hint">
            支持 MCP Streamable HTTP 的客户端，填 URL 和请求头即可。请求头固定是
            <code>Authorization: Bearer &lt;MCP key&gt;</code>。下面的示例使用左侧新
            key，写入后端并重启后才会生效。
          </p>
          <pre class="code-block">{{ clientConfig }}</pre>
          <el-button @click="copy(clientConfig)">
            <el-icon><CopyDocument /></el-icon>
            复制客户端配置
          </el-button>
        </div>
      </section>

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
import { ElMessage } from 'element-plus'
import {
  CircleCheck,
  Connection,
  CopyDocument,
  DataAnalysis,
  DocumentCopy,
  Key,
  Link,
  Refresh,
  WarningFilled,
} from '@element-plus/icons-vue'
import { mcpApi, type McpConnectionInfo } from '@/api/mcp'

const loading = ref(false)
const info = ref<McpConnectionInfo | null>(null)
const clientId = ref('ai-reader')
const generatedKey = ref(generateToken())

const endpoint = computed(() => info.value?.endpoint || getFallbackEndpoint())

const envSnippet = computed(() => {
  const id = sanitizeClientId(clientId.value)
  return `MCP_API_KEYS=${id}:${generatedKey.value}`
})

const clientConfig = computed(() =>
  JSON.stringify(
    {
      mcpServers: {
        matrixflow: {
          type: 'http',
          url: endpoint.value,
          headers: {
            Authorization: `Bearer ${generatedKey.value || '<MCP key>'}`,
          },
        },
      },
    },
    null,
    2,
  ),
)

onMounted(() => {
  loadConnectionInfo()
})

async function loadConnectionInfo() {
  loading.value = true
  try {
    const res = await mcpApi.getConnectionInfo()
    info.value = res.data
  } finally {
    loading.value = false
  }
}

function refreshKey() {
  generatedKey.value = generateToken()
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  ElMessage.success('已复制')
}

function generateToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function sanitizeClientId(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '-') || 'ai-reader'
}

function getFallbackEndpoint() {
  const apiBase = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  const baseUrl = new URL(apiBase, window.location.origin).toString().replace(/\/$/, '')
  return `${baseUrl}/mcp`
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
.setup-panel,
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

.setup-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.setup-panel {
  padding: 18px;
  min-width: 0;
}

.form-row {
  margin-bottom: 12px;

  label {
    display: block;
    margin-bottom: 6px;
    color: $text-tertiary;
    font-size: 12px;
    font-weight: 600;
  }
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

.code-block {
  min-height: 92px;
  max-height: 280px;
  margin: 0 0 12px;
  padding: 12px;
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
  .setup-grid,
  .catalog-panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .mcp-access__header,
  .copy-row {
    flex-direction: column;
  }

  .copy-row .el-button {
    width: 100%;
  }
}
</style>
