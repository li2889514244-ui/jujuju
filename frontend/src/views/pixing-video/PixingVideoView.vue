<template>
  <div class="pixing-video">
    <el-row :gutter="20">
      <!-- 创建任务 -->
      <el-col :span="10">
        <el-card shadow="hover">
          <template #header>
            <span class="card-title">创建视频任务</span>
          </template>

          <el-form
            ref="formRef"
            :model="form"
            :rules="rules"
            label-width="80px"
          >
            <el-form-item label="老师形象" prop="teacher">
              <el-input
                v-model="form.teacher"
                placeholder="输入老师名字，例如：张老师"
              />
            </el-form-item>

            <el-form-item label="视频文案" prop="text">
              <el-input
                v-model="form.text"
                type="textarea"
                :rows="8"
                placeholder="输入文案内容（同时也是字幕内容）"
              />
              <div class="char-count">{{ form.text.length }} 字</div>
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                :loading="submitting"
                @click="handleSubmit"
              >
                {{ submitting ? '提交中...' : '创建任务' }}
              </el-button>
              <el-button @click="resetForm">清空</el-button>
            </el-form-item>
          </el-form>

          <el-divider />

          <div class="tip-box">
            <el-text type="info" size="small">
              <el-icon><InfoFilled /></el-icon>
              任务创建后，本地服务会自动执行：<br />
              登录披星教育 → 选老师 → 输入文案 → 合成视频 → 下载 → 生成字幕
            </el-text>
          </div>
        </el-card>
      </el-col>

      <!-- 任务列表 -->
      <el-col :span="14">
        <el-card shadow="hover">
          <template #header>
            <div class="list-header">
              <span class="card-title">任务列表</span>
              <el-button size="small" @click="refreshTasks" :loading="loading">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </div>
          </template>

          <el-table :data="tasks" v-loading="loading" empty-text="暂无任务">
            <el-table-column prop="teacher" label="老师" width="100" />
            <el-table-column prop="text" label="文案" min-width="150" show-overflow-tooltip />
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag
                  :type="statusType(row.status)"
                  size="small"
                >
                  {{ statusText(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="120">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'completed' && row.videoUrl"
                  type="primary"
                  size="small"
                  link
                  @click="downloadVideo(row)"
                >
                  下载视频
                </el-button>
                <el-button
                  v-if="row.status === 'completed' && row.srtContent"
                  size="small"
                  link
                  @click="downloadSrt(row)"
                >
                  下载字幕
                </el-button>
                <span v-if="row.status === 'pending'" class="waiting-text">等待执行...</span>
                <span v-if="row.status === 'processing'" class="processing-text">生成中...</span>
                <span v-if="row.status === 'failed'" class="error-text" :title="row.error || ''">
                  失败
                </span>
              </template>
            </el-table-column>
            <el-table-column prop="createdAt" label="创建时间" width="160">
              <template #default="{ row }">
                {{ formatTime(row.createdAt) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled, Refresh } from '@element-plus/icons-vue'
import { pixingVideoApi, type PixingVideoTask } from '@/api/pixing-video'

const formRef = ref()
const submitting = ref(false)
const loading = ref(false)
const tasks = ref<PixingVideoTask[]>([])

const form = ref({
  teacher: '',
  text: '',
})

const rules = {
  teacher: [{ required: true, message: '请输入老师名字', trigger: 'blur' }],
  text: [{ required: true, message: '请输入视频文案', trigger: 'blur' }],
}

type TagType = 'success' | 'primary' | 'warning' | 'info' | 'danger'

const statusType = (s: string): TagType => {
  const map: Record<string, TagType> = {
    pending: 'info',
    processing: 'warning',
    completed: 'success',
    failed: 'danger',
  }
  return map[s] || 'info'
}

const statusText = (s: string) => {
  const map: Record<string, string> = {
    pending: '等待中',
    processing: '生成中',
    completed: '已完成',
    failed: '失败',
  }
  return map[s] || s
}

const formatTime = (t: string) => {
  if (!t) return ''
  return new Date(t).toLocaleString('zh-CN')
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await pixingVideoApi.createTask({
      teacher: form.value.teacher,
      text: form.value.text,
    })
    ElMessage.success('任务创建成功')
    form.value.text = ''
    await refreshTasks()
  } catch (e: any) {
    ElMessage.error(e?.message || '创建失败')
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  form.value.teacher = ''
  form.value.text = ''
}

async function refreshTasks() {
  loading.value = true
  try {
    const res = await pixingVideoApi.listTasks()
    tasks.value = res.data || []
  } catch (e) {
    // 静默失败
  } finally {
    loading.value = false
  }
}

function downloadVideo(task: PixingVideoTask) {
  if (task.videoUrl) {
    window.open(task.videoUrl, '_blank')
  }
}

function downloadSrt(task: PixingVideoTask) {
  if (task.srtContent) {
    const blob = new Blob([task.srtContent], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${task.teacher}_${task.id.substring(0, 8)}.srt`
    a.click()
    URL.revokeObjectURL(url)
  }
}

onMounted(() => {
  refreshTasks()
})
</script>

<style scoped>
.pixing-video {
  padding: 20px;
}

.card-title {
  font-weight: 600;
  font-size: 15px;
}

.char-count {
  text-align: right;
  color: #999;
  font-size: 12px;
  margin-top: 4px;
}

.tip-box {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
  line-height: 1.8;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.waiting-text { color: #909399; font-size: 13px; }
.processing-text { color: #e6a23c; font-size: 13px; }
.error-text { color: #f56c6c; font-size: 13px; cursor: help; }
</style>
