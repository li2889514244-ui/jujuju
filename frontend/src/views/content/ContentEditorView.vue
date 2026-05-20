<template>
  <div class="content-editor">
    <el-card shadow="hover">
      <template #header>
        <div class="content-editor__header">
          <span>{{ isEditing ? '编辑内容' : '新建内容' }}</span>
          <div>
            <el-button @click="handleSaveDraft">保存草稿</el-button>
            <el-button type="primary" @click="handleSaveAndPublish">保存并发布</el-button>
          </div>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
        class="content-editor__form"
      >
        <!-- Video Upload -->
        <el-form-item label="视频文件" prop="videoFile">
          <FileUpload
            accept="video/*"
            :max-size="500"
            :limit="1"
            tip="支持 MP4/MOV 格式，最大 500MB"
            @success="handleVideoUploaded"
          />
          <div v-if="videoUrl" class="content-editor__preview">
            <video :src="videoUrl" controls class="content-editor__video" />
          </div>
        </el-form-item>

        <!-- Cover Upload -->
        <el-form-item label="封面图">
          <FileUpload
            accept="image/*"
            :max-size="10"
            :limit="1"
            tip="支持 JPG/PNG 格式，建议 16:9 比例"
            @success="handleCoverUploaded"
          />
          <div v-if="coverUrl" class="content-editor__cover-preview">
            <img :src="coverUrl" alt="封面" />
          </div>
        </el-form-item>

        <!-- Title -->
        <el-form-item label="标题" prop="title">
          <el-input
            v-model="form.title"
            placeholder="请输入视频标题"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>

        <!-- Description -->
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            placeholder="请输入视频描述"
            :rows="4"
            maxlength="2000"
            show-word-limit
            @input="debouncedCheck"
          />
        </el-form-item>

        <!-- 违规检测提示 -->
        <el-form-item v-if="reviewHighlights.length > 0" label="内容检测">
          <div class="content-editor__review">
            <el-alert
              :title="`检测到 ${reviewHighlights.length} 处风险词`"
              :type="hasHighRisk ? 'error' : 'warning'"
              :closable="false"
              show-icon
            />
            <div class="content-editor__review-list">
              <el-tag
                v-for="(item, idx) in reviewHighlights"
                :key="idx"
                :type="
                  item.severity === 'HIGH'
                    ? 'danger'
                    : item.severity === 'MEDIUM'
                      ? 'warning'
                      : 'info'
                "
                size="small"
                style="margin: 4px"
              >
                {{ item.word }}
              </el-tag>
            </div>
          </div>
        </el-form-item>

        <!-- Tags -->
        <el-form-item label="标签">
          <div class="content-editor__tags">
            <el-tag
              v-for="tag in form.tags"
              :key="tag"
              closable
              @close="removeTag(tag)"
              style="margin-right: 8px; margin-bottom: 8px"
            >
              {{ tag }}
            </el-tag>
            <el-input
              v-if="tagInputVisible"
              ref="tagInputRef"
              v-model="tagInputValue"
              size="small"
              style="width: 120px"
              @keyup.enter="addTag"
              @blur="addTag"
            />
            <el-button v-else size="small" @click="showTagInput">+ 添加标签</el-button>
          </div>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDebounceFn } from '@vueuse/core'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { useContentStore } from '@/store/content'
import { contentReviewApi } from '@/api/content-review'
import FileUpload from '@/components/common/FileUpload.vue'

const route = useRoute()
const router = useRouter()
const contentStore = useContentStore()

const formRef = ref<FormInstance>()
const tagInputRef = ref()
const tagInputVisible = ref(false)
const tagInputValue = ref('')
const videoUrl = ref('')
const coverUrl = ref('')
const reviewHighlights = ref<{ word: string; severity: string }[]>([])
const hasHighRisk = computed(() => reviewHighlights.value.some((h) => h.severity === 'HIGH'))

const contentId = ref(route.query.id as string | undefined)
const isEditing = ref(!!contentId.value)

const form = reactive({
  title: '',
  description: '',
  tags: [] as string[],
})

const rules: FormRules = {
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  description: [{ required: true, message: '请输入描述', trigger: 'blur' }],
}

onMounted(async () => {
  if (contentId.value) {
    await contentStore.fetchContentDetail(contentId.value)
    const content = contentStore.currentContent
    if (content) {
      form.title = content.title
      form.description = content.description
      form.tags = [...content.tags]
      videoUrl.value = content.videoUrl
      coverUrl.value = content.coverUrl
    }
  }
})

function handleVideoUploaded(response: unknown) {
  const data = response as { url: string }
  videoUrl.value = data.url
}

function handleCoverUploaded(response: unknown) {
  const data = response as { url: string }
  coverUrl.value = data.url
}

function showTagInput() {
  tagInputVisible.value = true
  nextTick(() => tagInputRef.value?.focus())
}

function addTag() {
  const value = tagInputValue.value.trim()
  if (value && !form.tags.includes(value)) {
    form.tags.push(value)
  }
  tagInputVisible.value = false
  tagInputValue.value = ''
}

function removeTag(tag: string) {
  form.tags = form.tags.filter((t) => t !== tag)
}

// 违规检测 - 防抖 800ms
const debouncedCheck = useDebounceFn(async () => {
  const text = `${form.title} ${form.description}`
  if (text.trim().length < 5) {
    reviewHighlights.value = []
    return
  }
  try {
    const result = await contentReviewApi.quickCheck(text)
    reviewHighlights.value = result.data.highlights || []
  } catch {
    // 静默失败，不影响编辑体验
  }
}, 800)

async function handleSaveDraft() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const content = await contentStore.saveContent({
    id: contentId.value,
    ...form,
  })
  ElMessage.success('草稿已保存')
  // 保存后从返回值获取最新 id，避免使用过期的 contentId
  if (content?.id) {
    contentId.value = content.id
    if (!route.query.id) {
      router.replace({ query: { id: content.id } })
    }
  }
}

async function handleSaveAndPublish() {
  await handleSaveDraft()
  // 使用最新的 contentId（可能已在 handleSaveDraft 中更新）
  router.push(`/publish?contentId=${contentId.value}`)
}
</script>

<style lang="scss" scoped>
.content-editor {
  max-width: 900px;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__form {
    max-width: 700px;
  }

  &__preview {
    margin-top: 12px;
  }

  &__video {
    max-width: 400px;
    max-height: 300px;
    border-radius: 8px;
  }

  &__cover-preview {
    margin-top: 12px;

    img {
      max-width: 300px;
      max-height: 200px;
      border-radius: 8px;
      object-fit: cover;
    }
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
  }

  &__review {
    width: 100%;
  }

  &__review-list {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
  }
}
</style>
