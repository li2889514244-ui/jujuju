<template>
  <el-dialog
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    title="手动添加账号"
    width="480px"
    :close-on-click-modal="false"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-form-item label="平台" prop="platform">
        <el-select v-model="form.platform" placeholder="选择平台" style="width: 100%">
          <el-option v-for="p in platforms" :key="p.value" :label="p.label" :value="p.value" />
        </el-select>
      </el-form-item>

      <el-form-item label="平台用户ID" prop="platformUserId">
        <el-input v-model="form.platformUserId" placeholder="平台分配的用户ID（如抖音UID）" />
      </el-form-item>

      <el-form-item label="昵称" prop="nickname">
        <el-input v-model="form.nickname" placeholder="账号昵称" />
      </el-form-item>

      <el-form-item label="简介">
        <el-input v-model="form.bio" placeholder="账号简介（选填）" type="textarea" :rows="2" />
      </el-form-item>

      <el-form-item label="头像URL">
        <el-input v-model="form.avatar" placeholder="头像链接（选填）" />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">确认添加</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { accountsApi } from '@/api/accounts'

defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  'update:visible': [value: boolean]
  success: []
}>()

const platforms = [
  { value: 'DOUYIN', label: '抖音' },
  { value: 'XIAOHONGSHU', label: '小红书' },
  { value: 'KUAISHOU', label: '快手' },
  { value: 'BILIBILI', label: 'B站' },
  { value: 'WEIBO', label: '微博' },
  { value: 'WECHAT_VIDEO', label: '视频号' },
]

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  platform: '',
  platformUserId: '',
  nickname: '',
  bio: '',
  avatar: '',
})

const rules: FormRules = {
  platform: [{ required: true, message: '请选择平台', trigger: 'change' }],
  platformUserId: [{ required: true, message: '请输入平台用户ID', trigger: 'blur' }],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await accountsApi.create({
      platform: form.platform,
      platformUserId: form.platformUserId,
      nickname: form.nickname,
      bio: form.bio || undefined,
      avatar: form.avatar || undefined,
    })
    ElMessage.success('账号添加成功')
    emit('success')
    emit('update:visible', false)
    // reset form
    form.platform = ''
    form.platformUserId = ''
    form.nickname = ''
    form.bio = ''
    form.avatar = ''
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.message || '添加失败')
  } finally {
    loading.value = false
  }
}
</script>
