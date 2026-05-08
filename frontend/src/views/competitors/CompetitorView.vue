<template>
  <div class="competitors">
    <!-- Header -->
    <el-card shadow="hover" class="competitors__header">
      <div class="competitors__header-row">
        <div>
          <el-select v-model="filterPlatform" placeholder="全部平台" clearable style="width: 140px">
            <el-option label="全部" value="" />
            <el-option v-for="(label, key) in PLATFORM_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </div>
        <el-button type="primary" @click="showAddDialog = true">添加竞对</el-button>
      </div>
    </el-card>

    <!-- Competitor List -->
    <el-card shadow="hover">
      <el-table :data="filteredList" v-loading="loading" stripe>
        <el-table-column label="账号" min-width="200">
          <template #default="{ row }">
            <div class="competitors__account">
              <el-avatar :src="row.avatar" :size="36">{{ row.nickname?.[0] }}</el-avatar>
              <div class="competitors__account-info">
                <span class="competitors__account-name">{{ row.nickname }}</span>
                <span class="competitors__account-id">{{ row.platformUserId }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="平台" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="platformTagType(row.platform)">
              {{ PLATFORM_LABELS[row.platform] || row.platform }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="followers" label="粉丝数" width="120">
          <template #default="{ row }">{{ row.followers?.toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="7日趋势" width="160">
          <template #default="{ row }">
            <MiniTrend :data="getFollowerTrend(row)" />
          </template>
        </el-table-column>
        <el-table-column prop="note" label="备注" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewDetail(row)">详情</el-button>
            <el-popconfirm title="确定删除该竞对？" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button link type="danger" size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Add Dialog -->
    <el-dialog v-model="showAddDialog" title="添加竞对账号" width="480px" destroy-on-close>
      <el-form :model="addForm" label-width="80px">
        <el-form-item label="平台" required>
          <el-select v-model="addForm.platform" placeholder="选择平台" style="width: 100%">
            <el-option v-for="(label, key) in PLATFORM_LABELS" :key="key" :label="label" :value="key" />
          </el-select>
        </el-form-item>
        <el-form-item label="用户ID" required>
          <el-input v-model="addForm.platformUserId" placeholder="平台用户ID" />
        </el-form-item>
        <el-form-item label="昵称" required>
          <el-input v-model="addForm.nickname" placeholder="账号昵称" />
        </el-form-item>
        <el-form-item label="头像">
          <el-input v-model="addForm.avatar" placeholder="头像URL（可选）" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="addForm.note" type="textarea" :rows="2" placeholder="备注信息" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleAdd">确定</el-button>
      </template>
    </el-dialog>

    <!-- Detail Drawer -->
    <el-drawer v-model="showDetail" :title="detailData?.nickname" size="500px" destroy-on-close>
      <template v-if="detailData">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="平台">{{ PLATFORM_LABELS[detailData.platform] }}</el-descriptions-item>
          <el-descriptions-item label="粉丝">{{ detailData.followers?.toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="关注">{{ detailData.following?.toLocaleString() }}</el-descriptions-item>
          <el-descriptions-item label="用户ID">{{ detailData.platformUserId }}</el-descriptions-item>
          <el-descriptions-item label="备注" :span="2">{{ detailData.note || '-' }}</el-descriptions-item>
        </el-descriptions>

        <h4 style="margin: 20px 0 12px">数据趋势（近30天）</h4>
        <DataChart :option="detailChart" :height="280" />
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { competitorsApi, type Competitor } from '@/api/competitors'
import { PLATFORM_LABELS } from '@/types'
import DataChart from '@/components/common/DataChart.vue'
import MiniTrend from '@/components/common/MiniTrend.vue'

const loading = ref(false)
const submitting = ref(false)
const showAddDialog = ref(false)
const showDetail = ref(false)
const filterPlatform = ref('')
const list = ref<Competitor[]>([])
const detailData = ref<Competitor | null>(null)

const addForm = ref({
  platform: '',
  platformUserId: '',
  nickname: '',
  avatar: '',
  note: '',
})

const filteredList = computed(() => {
  if (!filterPlatform.value) return list.value
  return list.value.filter((c) => c.platform === filterPlatform.value)
})

function platformTagType(platform: string) {
  const map: Record<string, string> = {
    DOUYIN: '',
    XIAOHONGSHU: 'danger',
    KUAISHOU: 'warning',
    WECHAT_VIDEO: 'success',
    BILIBILI: 'info',
  }
  return map[platform] || ''
}

function getFollowerTrend(row: Competitor): number[] {
  if (!row.snapshots || row.snapshots.length === 0) return []
  return row.snapshots.slice().reverse().map((s) => s.followers)
}

async function loadList() {
  loading.value = true
  try {
    const res = await competitorsApi.getList()
    list.value = res.data?.competitors || []
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function handleAdd() {
  if (!addForm.value.platform || !addForm.value.platformUserId || !addForm.value.nickname) {
    ElMessage.warning('请填写必填项')
    return
  }
  submitting.value = true
  try {
    await competitorsApi.create(addForm.value)
    ElMessage.success('添加成功')
    showAddDialog.value = false
    addForm.value = { platform: '', platformUserId: '', nickname: '', avatar: '', note: '' }
    await loadList()
  } catch (e: any) {
    ElMessage.error(e.message || '添加失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await competitorsApi.remove(id)
    ElMessage.success('已删除')
    await loadList()
  } catch (e: any) {
    ElMessage.error(e.message || '删除失败')
  }
}

async function viewDetail(row: Competitor) {
  try {
    const res = await competitorsApi.getDetail(row.id)
    detailData.value = res.data
    showDetail.value = true
  } catch (e: any) {
    ElMessage.error(e.message || '获取详情失败')
  }
}

const detailChart = computed(() => {
  if (!detailData.value?.snapshots?.length) {
    return { title: { text: '暂无数据', left: 'center', top: 'center' } }
  }
  const snapshots = detailData.value.snapshots.slice().reverse()
  const dates = snapshots.map((s) => s.date.slice(5, 10))
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['粉丝', '播放', '点赞'] },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category' as const, data: dates },
    yAxis: { type: 'value' as const },
    series: [
      { name: '粉丝', type: 'line' as const, smooth: true, data: snapshots.map((s) => s.followers) },
      { name: '播放', type: 'line' as const, smooth: true, data: snapshots.map((s) => s.views) },
      { name: '点赞', type: 'line' as const, smooth: true, data: snapshots.map((s) => s.likes) },
    ],
  }
})

onMounted(() => {
  loadList()
})
</script>

<style lang="scss" scoped>
.competitors {
  &__header {
    margin-bottom: 20px;
  }

  &__header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  &__account {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__account-info {
    display: flex;
    flex-direction: column;
  }

  &__account-name {
    font-weight: 500;
    font-size: 14px;
  }

  &__account-id {
    font-size: 12px;
    color: #999;
  }
}
</style>
