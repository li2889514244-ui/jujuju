<template>
  <div class="file-upload">
    <el-upload
      ref="uploadRef"
      :action="action"
      :accept="accept"
      :limit="limit"
      :multiple="multiple"
      :file-list="fileList"
      :auto-upload="autoUpload"
      :before-upload="handleBeforeUpload"
      :on-success="handleSuccess"
      :on-error="handleError"
      :on-exceed="handleExceed"
      :on-change="handleChange"
      :drag="drag"
      :show-file-list="showFileList"
    >
      <slot>
        <template v-if="drag">
          <div class="file-upload__drag">
            <el-icon :size="40" class="file-upload__icon"><UploadFilled /></el-icon>
            <div class="file-upload__text">将文件拖到此处，或<em>点击上传</em></div>
            <div v-if="tip" class="file-upload__tip">{{ tip }}</div>
          </div>
        </template>
        <template v-else>
          <el-button type="primary">
            <el-icon><Upload /></el-icon>选择文件
          </el-button>
          <div v-if="tip" class="file-upload__tip">{{ tip }}</div>
        </template>
      </slot>
    </el-upload>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type {
  UploadFile,
  UploadFiles,
  UploadInstance,
  UploadRawFile,
  UploadUserFile,
} from 'element-plus'

const props = withDefaults(
  defineProps<{
    action?: string
    accept?: string
    limit?: number
    multiple?: boolean
    maxSize?: number // MB
    autoUpload?: boolean
    drag?: boolean
    showFileList?: boolean
    tip?: string
  }>(),
  {
    action: '/api/upload',
    limit: 5,
    multiple: false,
    maxSize: 100,
    autoUpload: true,
    drag: false,
    showFileList: true,
  },
)

const emit = defineEmits<{
  success: [response: unknown, file: UploadFile]
  error: [error: unknown, file: UploadFile]
  change: [file: UploadFile, fileList: UploadFiles]
  exceed: [files: File[], uploadFiles: UploadUserFile[]]
}>()

const uploadRef = ref<UploadInstance>()
const fileList = ref<UploadFiles>([])

function handleBeforeUpload(file: UploadRawFile) {
  const isLimit = file.size / 1024 / 1024 < props.maxSize
  if (!isLimit) {
    ElMessage.error(`文件大小不能超过 ${props.maxSize}MB`)
    return false
  }
  return true
}

function handleSuccess(response: unknown, file: UploadFile) {
  emit('success', response, file)
}

function handleError(error: unknown, file: UploadFile) {
  ElMessage.error('上传失败')
  emit('error', error, file)
}

function handleChange(file: UploadFile, uploadFileList: UploadFiles) {
  emit('change', file, uploadFileList)
}

function handleExceed(files: File[], uploadFiles: UploadUserFile[]) {
  ElMessage.warning(`最多上传 ${props.limit} 个文件`)
  emit('exceed', files, uploadFiles)
}

function clearFiles() {
  uploadRef.value?.clearFiles()
}

defineExpose({ clearFiles })
</script>

<style lang="scss" scoped>
.file-upload {
  &__drag {
    padding: 40px 20px;
    text-align: center;
  }

  &__icon {
    color: #48484a;
    margin-bottom: 12px;
  }

  &__text {
    color: #98989d;
    font-size: 14px;

    em {
      color: $primary-color;
      font-style: normal;
    }
  }

  &__tip {
    color: #6e6e73;
    font-size: 12px;
    margin-top: 8px;
  }
}
</style>
