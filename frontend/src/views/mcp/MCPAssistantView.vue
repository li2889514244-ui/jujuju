<template>
  <div class="mcp-page">
    <!-- Left: Tools Panel -->
    <aside class="mcp-page__tools" :class="{ 'mcp-page__tools--collapsed': toolsCollapsed }">
      <div class="tools-header">
        <h3 v-if="!toolsCollapsed">可用工具</h3>
        <el-button text class="tools-toggle" @click="toolsCollapsed = !toolsCollapsed">
          <el-icon :size="16">
            <component :is="toolsCollapsed ? DArrowRight : DArrowLeft" />
          </el-icon>
        </el-button>
      </div>

      <div v-if="!toolsCollapsed" class="tools-body">
        <div v-if="toolsLoading" class="tools-loading">
          <el-icon class="is-loading" :size="18"><Loading /></el-icon>
          <span>加载中...</span>
        </div>
        <div v-else-if="toolsError" class="tools-error">
          <el-icon :size="18"><WarningFilled /></el-icon>
          <span>{{ toolsError }}</span>
          <el-button link type="primary" size="small" @click="fetchTools">重试</el-button>
        </div>
        <div v-else-if="tools.length === 0" class="tools-empty">
          <span>暂无可用工具</span>
        </div>
        <div v-else class="tools-list">
          <div
            v-for="tool in tools"
            :key="tool.name"
            class="tool-card"
            @click="insertToolPrompt(tool)"
          >
            <div class="tool-card__name">
              <el-icon :size="14"><Tools /></el-icon>
              {{ tool.name }}
            </div>
            <div class="tool-card__desc">{{ tool.description }}</div>
          </div>
        </div>
      </div>
    </aside>

    <!-- Right: Chat Area -->
    <div class="mcp-page__chat">
      <!-- Header -->
      <div class="chat-header">
        <div class="chat-header__title">
          <el-icon :size="20"><ChatDotRound /></el-icon>
          <h2>MCP 数据查询</h2>
        </div>
        <el-tag size="small" :type="backendStatus === 'connected' ? 'success' : 'warning'">
          {{ backendStatus === 'connected' ? '已连接' : '演示模式' }}
        </el-tag>
      </div>

      <!-- Messages -->
      <div ref="messagesContainer" class="chat-messages">
        <div v-if="messages.length === 0" class="chat-empty">
          <div class="chat-empty__icon">
            <el-icon :size="48"><ChatLineSquare /></el-icon>
          </div>
          <p class="chat-empty__title">用自然语言查询数据</p>
          <p class="chat-empty__hint">例如："卢慧本月带货数据"、"上周各平台销售额对比"</p>
        </div>

        <div
          v-for="(msg, idx) in messages"
          :key="idx"
          class="chat-message"
          :class="`chat-message--${msg.role}`"
        >
          <!-- User message -->
          <template v-if="msg.role === 'user'">
            <div class="message-bubble message-bubble--user">
              {{ msg.content }}
            </div>
          </template>

          <!-- Assistant message -->
          <template v-else>
            <div class="message-bubble message-bubble--assistant">
              <!-- Loading -->
              <div v-if="msg.loading" class="message-loading">
                <el-icon class="is-loading" :size="16"><Loading /></el-icon>
                <span>正在查询...</span>
              </div>

              <!-- Error -->
              <div v-else-if="msg.error" class="message-error">
                <el-icon :size="16"><WarningFilled /></el-icon>
                <span>{{ msg.error }}</span>
              </div>

              <!-- Result -->
              <template v-else-if="msg.result">
                <!-- Text -->
                <div v-if="msg.result.text" class="message-text">{{ msg.result.text }}</div>

                <!-- Table -->
                <div v-if="msg.result.table" class="message-table">
                  <el-table
                    :data="msg.result.table.rows"
                    border
                    stripe
                    size="small"
                    max-height="400"
                    style="width: 100%"
                  >
                    <el-table-column
                      v-for="col in msg.result.table.columns"
                      :key="col"
                      :prop="col"
                      :label="col"
                      min-width="120"
                      show-overflow-tooltip
                    />
                  </el-table>
                </div>

                <!-- CSV Export -->
                <div v-if="msg.result.csv_url" class="message-csv">
                  <el-link
                    :href="msg.result.csv_url"
                    target="_blank"
                    type="primary"
                    :underline="false"
                  >
                    <el-icon :size="14"><Download /></el-icon>
                    下载 CSV 文件
                  </el-link>
                </div>
              </template>
            </div>
          </template>
        </div>
      </div>

      <!-- Input -->
      <div class="chat-input">
        <el-input
          v-model="inputText"
          type="textarea"
          :rows="2"
          placeholder="输入自然语言查询，例如：卢慧本月带货数据"
          resize="none"
          :disabled="queryLoading"
          @keydown.enter.exact.prevent="handleSend"
        />
        <el-button
          type="primary"
          :loading="queryLoading"
          :disabled="!inputText.trim()"
          @click="handleSend"
        >
          <el-icon :size="16"><Promotion /></el-icon>
          <span>发送</span>
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import {
  ChatDotRound,
  ChatLineSquare,
  Loading,
  Promotion,
  WarningFilled,
  DArrowLeft,
  DArrowRight,
  Tools,
  Download,
} from '@element-plus/icons-vue'
import { mcpApi, type MCPTool, type MCPQueryResult } from '@/api/mcp'

interface ChatMessage {
  role: 'user' | 'assistant'
  content?: string
  loading?: boolean
  error?: string
  result?: MCPQueryResult
}

// ---- State ----
const tools = ref<MCPTool[]>([])
const toolsLoading = ref(false)
const toolsError = ref('')
const toolsCollapsed = ref(false)

const messages = ref<ChatMessage[]>([])
const inputText = ref('')
const queryLoading = ref(false)
const backendStatus = ref<'loading' | 'connected' | 'mock'>('loading')
const messagesContainer = ref<HTMLElement | null>(null)

// ---- Lifecycle ----
onMounted(() => {
  fetchTools()
})

watch(
  () => messages.value.length,
  () => {
    nextTick(() => scrollToBottom())
  },
)

// ---- Methods ----
async function fetchTools() {
  toolsLoading.value = true
  toolsError.value = ''
  try {
    const data = await mcpApi.getTools()
    tools.value = Array.isArray(data) ? data : []
    backendStatus.value = 'connected'
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '获取工具列表失败'
    toolsError.value = msg
    backendStatus.value = 'mock'
  } finally {
    toolsLoading.value = false
  }
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || queryLoading.value) return

  // Add user message
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''

  // Add assistant placeholder
  const assistantMsg: ChatMessage = { role: 'assistant', loading: true }
  messages.value.push(assistantMsg)

  queryLoading.value = true
  try {
    const result = await mcpApi.query(text)
    assistantMsg.loading = false
    assistantMsg.result = result
  } catch (e: unknown) {
    assistantMsg.loading = false
    assistantMsg.error = e instanceof Error ? e.message : '查询失败，请重试'
  } finally {
    queryLoading.value = false
  }
}

function insertToolPrompt(tool: MCPTool) {
  inputText.value = `使用 ${tool.name} 工具${tool.description ? '：' + tool.description : ''}`
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables';

.mcp-page {
  display: flex;
  height: 100%;
  gap: $space-md;
}

// ---- Tools Panel ----
.mcp-page__tools {
  width: 260px;
  flex-shrink: 0;
  background: $color-bg-secondary;
  border: 1px solid $color-border;
  border-radius: $radius-lg;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.25s $ease-out;

  &--collapsed {
    width: 48px;

    .tools-header {
      justify-content: center;
    }
  }
}

.tools-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-sm $space-md;
  border-bottom: 1px solid $color-border;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: $text-caption;
    font-weight: 500;
    color: $color-text-secondary;
    white-space: nowrap;
  }
}

.tools-toggle {
  color: $color-text-tertiary;
  padding: 4px;
  &:hover {
    color: $color-text-primary;
  }
}

.tools-body {
  flex: 1;
  overflow-y: auto;
  padding: $space-sm;
}

.tools-loading,
.tools-error,
.tools-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: $space-md;
  color: $color-text-tertiary;
  font-size: $text-caption;
}

.tools-error {
  flex-wrap: wrap;
  color: $color-danger;
}

.tools-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-card {
  padding: $space-sm;
  border-radius: $radius-sm;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(0, 204, 153, 0.05);
    border-color: rgba(0, 204, 153, 0.12);
  }

  &__name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: $text-caption;
    font-weight: 500;
    color: $color-accent;
    margin-bottom: 4px;
  }

  &__desc {
    font-size: $text-micro;
    color: $color-text-tertiary;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

// ---- Chat Area ----
.mcp-page__chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: $color-bg-secondary;
  border: 1px solid $color-border;
  border-radius: $radius-lg;
  overflow: hidden;
  min-width: 0;
}

.chat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: $space-sm $space-lg;
  border-bottom: 1px solid $color-border;
  flex-shrink: 0;

  &__title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: $color-accent;

    h2 {
      margin: 0;
      font-size: $text-title;
      font-weight: 500;
      color: $color-text-primary;
    }
  }
}

// ---- Messages ----
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: $space-lg;
  display: flex;
  flex-direction: column;
  gap: $space-md;
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: $color-text-tertiary;

  &__icon {
    margin-bottom: $space-md;
    opacity: 0.4;
  }

  &__title {
    font-size: $text-title;
    font-weight: 500;
    margin: 0 0 8px;
    color: $color-text-secondary;
  }

  &__hint {
    font-size: $text-caption;
    margin: 0;
  }
}

.chat-message {
  display: flex;

  &--user {
    justify-content: flex-end;
  }
  &--assistant {
    justify-content: flex-start;
  }
}

.message-bubble {
  max-width: 80%;
  padding: $space-sm $space-md;
  border-radius: $radius-lg;
  font-size: $text-body;
  line-height: 1.7;
  word-break: break-word;

  &--user {
    background: linear-gradient(135deg, rgba(0, 204, 153, 0.15), rgba(59, 130, 246, 0.1));
    border: 1px solid rgba(0, 204, 153, 0.2);
    color: $color-text-primary;
    border-bottom-right-radius: $radius-sm;
  }

  &--assistant {
    background: $color-bg-tertiary;
    border: 1px solid $color-border;
    color: $color-text-primary;
    border-bottom-left-radius: $radius-sm;
    min-width: 120px;
  }
}

.message-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: $color-text-tertiary;
  font-size: $text-caption;
}

.message-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: $color-danger;
  font-size: $text-caption;
}

.message-text {
  white-space: pre-wrap;
}

.message-table {
  margin-top: $space-sm;

  :deep(.el-table) {
    --el-table-bg-color: #{$color-bg-elevated};
    --el-table-tr-bg-color: #{$color-bg-elevated};
    --el-table-header-bg-color: #{$color-bg-tertiary};
    --el-table-border-color: #{$color-border};
    --el-table-text-color: #{$color-text-primary};
    --el-table-header-text-color: #{$color-text-secondary};

    th.el-table__cell {
      font-weight: 500;
      font-size: $text-caption;
    }
  }
}

.message-csv {
  margin-top: $space-sm;
  padding-top: $space-sm;
  border-top: 1px solid $color-border;
}

// ---- Input ----
.chat-input {
  display: flex;
  align-items: flex-end;
  gap: $space-sm;
  padding: $space-md $space-lg;
  border-top: 1px solid $color-border;
  flex-shrink: 0;

  :deep(.el-textarea__inner) {
    background: $color-bg-tertiary;
    border-color: $color-border;
    color: $color-text-primary;

    &::placeholder {
      color: $color-text-placeholder;
    }
    &:focus {
      border-color: $color-accent;
    }
  }
}
</style>
