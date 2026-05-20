<template>
  <div class="ai-assistant">
    <!-- Header -->
    <el-card shadow="hover" class="ai-assistant__header">
      <div class="header-content">
        <div class="header-info">
          <h2>
            <el-icon :size="22"><MagicStick /></el-icon> AI 智能助手
          </h2>
          <p class="subtitle">基于AI的内容创作、发布优化、趋势预测与风险检测</p>
        </div>
        <el-tag :type="providerStatus === 'mock' ? 'warning' : 'success'" size="large">
          {{
            providerStatus === 'loading'
              ? '连接中...'
              : providerStatus === 'connected'
                ? 'AI 已连接'
                : '演示模式 (Mock)'
          }}
        </el-tag>
      </div>
    </el-card>

    <!-- Main Tabs -->
    <el-tabs v-model="activeTab" type="border-card" class="ai-assistant__tabs">
      <!-- ===== Content Generation ===== -->
      <el-tab-pane name="content">
        <template #label
          ><el-icon :size="16"><EditPen /></el-icon> 智能创作</template
        >
        <el-row :gutter="20">
          <el-col :xs="24" :lg="10">
            <el-card shadow="hover">
              <template #header>创作参数</template>
              <el-form :model="contentForm" label-width="80px">
                <el-form-item label="类型">
                  <el-select v-model="contentForm.type" style="width: 100%">
                    <el-option label="视频脚本" value="video_script" />
                    <el-option label="标题优化" value="title" />
                    <el-option label="标签推荐" value="tags" />
                    <el-option label="文案生成" value="caption" />
                  </el-select>
                </el-form-item>
                <el-form-item label="主题">
                  <el-input v-model="contentForm.topic" placeholder="输入内容主题或关键词" />
                </el-form-item>
                <el-form-item label="平台">
                  <el-select v-model="contentForm.platform" clearable style="width: 100%">
                    <el-option
                      v-for="(label, key) in PLATFORM_LABELS"
                      :key="key"
                      :label="label"
                      :value="key"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="风格">
                  <el-input v-model="contentForm.style" placeholder="如：轻松有趣、专业严谨" />
                </el-form-item>
                <el-form-item label="受众">
                  <el-input v-model="contentForm.audience" placeholder="如：年轻用户、宝妈群体" />
                </el-form-item>
                <el-form-item label="参考">
                  <el-input
                    v-model="contentForm.reference"
                    type="textarea"
                    :rows="2"
                    placeholder="可选：粘贴参考内容"
                  />
                </el-form-item>
                <el-form-item v-if="contentForm.type === 'title'" label="数量">
                  <el-input-number v-model="contentForm.count" :min="1" :max="10" />
                </el-form-item>
                <el-form-item>
                  <el-button
                    type="primary"
                    :loading="contentLoading"
                    @click="handleGenerateContent"
                  >
                    <el-icon><MagicStick /></el-icon> AI 生成
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="14">
            <el-card shadow="hover" class="result-card">
              <template #header>
                <div class="result-header">
                  <span>生成结果</span>
                  <el-button v-if="contentResult" text @click="copyContent">
                    <el-icon><CopyDocument /></el-icon> 复制
                  </el-button>
                </div>
              </template>
              <div v-if="contentLoading" class="loading-state">
                <el-icon class="is-loading" :size="32"><Loading /></el-icon>
                <p>AI 正在创作中...</p>
              </div>
              <div v-else-if="contentResult" class="result-content">
                <div class="result-text" v-html="formatContent(contentResult.content)" />
                <div v-if="contentResult.keywords?.length" class="result-keywords">
                  <span class="label">关键词：</span>
                  <el-tag
                    v-for="kw in contentResult.keywords"
                    :key="kw"
                    size="small"
                    class="keyword-tag"
                  >
                    {{ kw }}
                  </el-tag>
                </div>
              </div>
              <el-empty v-else description="输入主题并点击生成，AI 将为你创作内容" />
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- ===== Publish Optimization ===== -->
      <el-tab-pane label="⏰ 发布优化" name="publish">
        <el-row :gutter="20">
          <el-col :xs="24" :lg="8">
            <el-card shadow="hover">
              <template #header>优化参数</template>
              <el-form :model="publishForm" label-width="80px">
                <el-form-item label="平台">
                  <el-select v-model="publishForm.platform" style="width: 100%">
                    <el-option
                      v-for="(label, key) in PLATFORM_LABELS"
                      :key="key"
                      :label="label"
                      :value="key"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="类型">
                  <el-input v-model="publishForm.contentType" placeholder="如：短视频、图文" />
                </el-form-item>
                <el-form-item label="受众">
                  <el-input v-model="publishForm.audience" placeholder="如：年轻用户" />
                </el-form-item>
                <el-form-item>
                  <el-button
                    type="primary"
                    :loading="publishLoading"
                    @click="handlePublishOptimize"
                  >
                    <el-icon><Timer /></el-icon> 分析最佳时间
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="16">
            <el-card v-if="publishResult" shadow="hover">
              <template #header
                ><el-icon :size="16"><TrendCharts /></el-icon> 发布时间建议</template
              >
              <el-row :gutter="16" class="time-slots">
                <el-col v-for="(slot, idx) in publishResult.bestSlots" :key="idx" :span="8">
                  <div class="time-slot" :class="{ 'is-best': idx === 0 }">
                    <div class="slot-rank">#{{ idx + 1 }}</div>
                    <div class="slot-time">{{ slot.day }} {{ slot.hour }}:00</div>
                    <div class="slot-score">
                      <el-progress :percentage="slot.score" :stroke-width="8" :show-text="false" />
                      <span>{{ slot.score }}分</span>
                    </div>
                    <div class="slot-reason">{{ slot.reason }}</div>
                  </div>
                </el-col>
              </el-row>
              <el-divider />
              <div class="publish-info">
                <h4>
                  <el-icon :size="14"><Calendar /></el-icon> 推荐发布频率
                </h4>
                <p>{{ publishResult.frequency.description }}</p>
              </div>
              <div v-if="publishResult.tips.length" class="publish-tips">
                <h4>
                  <el-icon :size="14"><Sunny /></el-icon> 优化建议
                </h4>
                <ul>
                  <li v-for="(tip, i) in publishResult.tips" :key="i">{{ tip }}</li>
                </ul>
              </div>
            </el-card>
            <el-card v-else shadow="hover">
              <el-empty description="选择平台后点击分析，获取最佳发布时间" />
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- ===== Trend Prediction ===== -->
      <el-tab-pane name="trend">
        <template #label
          ><el-icon :size="16"><TrendCharts /></el-icon> 趋势预测</template
        >
        <el-row :gutter="20">
          <el-col :xs="24" :lg="8">
            <el-card shadow="hover">
              <template #header>预测参数</template>
              <el-form :model="trendForm" label-width="80px">
                <el-form-item label="指标">
                  <el-select v-model="trendForm.metric" style="width: 100%">
                    <el-option label="粉丝数" value="followers" />
                    <el-option label="点赞数" value="likes" />
                    <el-option label="播放量" value="views" />
                    <el-option label="互动率" value="engagement" />
                  </el-select>
                </el-form-item>
                <el-form-item label="平台">
                  <el-select v-model="trendForm.platform" clearable style="width: 100%">
                    <el-option
                      v-for="(label, key) in PLATFORM_LABELS"
                      :key="key"
                      :label="label"
                      :value="key"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="预测天数">
                  <el-input-number v-model="trendForm.days" :min="7" :max="365" :step="7" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="trendLoading" @click="handleTrendPredict">
                    <el-icon><TrendCharts /></el-icon> 开始预测
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="16">
            <template v-if="trendResult">
              <el-row :gutter="16">
                <el-col :span="8">
                  <el-card shadow="hover" class="stat-card">
                    <div class="stat-label">当前值</div>
                    <div class="stat-value">{{ formatNumber(trendResult.currentValue) }}</div>
                  </el-card>
                </el-col>
                <el-col :span="8">
                  <el-card shadow="hover" class="stat-card">
                    <div class="stat-label">预测值 ({{ trendForm.days }}天后)</div>
                    <div class="stat-value">{{ formatNumber(trendResult.predictedValue) }}</div>
                  </el-card>
                </el-col>
                <el-col :span="8">
                  <el-card shadow="hover" class="stat-card">
                    <div class="stat-label">日均增长率</div>
                    <div
                      class="stat-value"
                      :class="trendResult.growthRate >= 0 ? 'text-success' : 'text-danger'"
                    >
                      {{ (trendResult.growthRate * 100).toFixed(2) }}%
                    </div>
                  </el-card>
                </el-col>
              </el-row>
              <el-card shadow="hover" style="margin-top: 16px">
                <template #header
                  ><el-icon :size="16"><Search /></el-icon> 趋势洞察</template
                >
                <div class="insights-list">
                  <div v-for="(insight, i) in trendResult.insights" :key="i" class="insight-item">
                    <el-icon><InfoFilled /></el-icon> {{ insight }}
                  </div>
                </div>
                <el-divider v-if="trendResult.recommendations.length" />
                <h4 v-if="trendResult.recommendations.length">
                  <el-icon :size="14"><Sunny /></el-icon> 建议
                </h4>
                <ul class="recommendations-list">
                  <li v-for="(rec, i) in trendResult.recommendations" :key="i">{{ rec }}</li>
                </ul>
              </el-card>
            </template>
            <el-card v-else shadow="hover">
              <el-empty description="选择指标和预测周期，AI 将分析趋势并给出预测" />
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- ===== Anomaly Detection ===== -->
      <el-tab-pane name="anomaly">
        <template #label
          ><el-icon :size="16"><Search /></el-icon> 异常检测</template
        >
        <el-row :gutter="20">
          <el-col :xs="24" :lg="8">
            <el-card shadow="hover">
              <template #header>检测参数</template>
              <el-form :model="anomalyForm" label-width="80px">
                <el-form-item label="数据集">
                  <el-input
                    v-model="anomalyForm.dataset"
                    type="textarea"
                    :rows="4"
                    placeholder="输入JSON数组，如: [100, 120, 95, 500, 110]"
                  />
                </el-form-item>
                <el-form-item label="指标">
                  <el-input v-model="anomalyForm.metric" placeholder="如：粉丝数、播放量" />
                </el-form-item>
                <el-form-item label="敏感度">
                  <el-radio-group v-model="anomalyForm.sensitivity">
                    <el-radio-button value="low">低</el-radio-button>
                    <el-radio-button value="medium">中</el-radio-button>
                    <el-radio-button value="high">高</el-radio-button>
                  </el-radio-group>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="anomalyLoading" @click="handleAnomalyDetect">
                    <el-icon><Warning /></el-icon> 开始检测
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="16">
            <template v-if="anomalyResult">
              <el-alert
                :title="anomalyResult.summary"
                :type="
                  anomalyResult.riskLevel === 'high'
                    ? 'error'
                    : anomalyResult.riskLevel === 'medium'
                      ? 'warning'
                      : 'success'
                "
                show-icon
                :closable="false"
                style="margin-bottom: 16px"
              />
              <el-row :gutter="16">
                <el-col :span="12">
                  <el-card shadow="hover">
                    <template #header
                      ><el-icon :size="16"><WarningFilled /></el-icon> 异常点 ({{
                        anomalyResult.anomalies.length
                      }})</template
                    >
                    <div v-if="anomalyResult.anomalies.length === 0" class="empty-text">
                      未检测到异常
                    </div>
                    <div v-for="(a, i) in anomalyResult.anomalies" :key="i" class="anomaly-item">
                      <el-tag :type="a.type === 'spike' ? 'danger' : 'warning'" size="small">
                        {{ a.type === 'spike' ? '突增' : '突降' }}
                      </el-tag>
                      <span
                        >索引 #{{ a.index }}: {{ a.value }} (z-score:
                        {{ a.zScore.toFixed(2) }})</span
                      >
                    </div>
                  </el-card>
                </el-col>
                <el-col :span="12">
                  <el-card shadow="hover">
                    <template #header
                      ><el-icon :size="16"><TrendCharts /></el-icon> 统计信息</template
                    >
                    <el-descriptions :column="1" border size="small">
                      <el-descriptions-item label="均值">{{
                        anomalyResult.statistics.mean.toFixed(2)
                      }}</el-descriptions-item>
                      <el-descriptions-item label="标准差">{{
                        anomalyResult.statistics.stdDev.toFixed(2)
                      }}</el-descriptions-item>
                      <el-descriptions-item label="最小值">{{
                        anomalyResult.statistics.min
                      }}</el-descriptions-item>
                      <el-descriptions-item label="最大值">{{
                        anomalyResult.statistics.max
                      }}</el-descriptions-item>
                      <el-descriptions-item label="数据点">{{
                        anomalyResult.statistics.dataPoints
                      }}</el-descriptions-item>
                    </el-descriptions>
                  </el-card>
                </el-col>
              </el-row>
              <el-card
                v-if="anomalyResult.recommendations.length"
                shadow="hover"
                style="margin-top: 16px"
              >
                <template #header
                  ><el-icon :size="16"><Sunny /></el-icon> 建议</template
                >
                <ul>
                  <li v-for="(rec, i) in anomalyResult.recommendations" :key="i">{{ rec }}</li>
                </ul>
              </el-card>
            </template>
            <el-card v-else shadow="hover">
              <el-empty description="输入数据集，AI 将自动检测异常数据点" />
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- ===== Content Review ===== -->
      <el-tab-pane name="review">
        <template #label
          ><el-icon :size="16"><CircleCheck /></el-icon> 内容审核</template
        >
        <el-row :gutter="20">
          <el-col :xs="24" :lg="10">
            <el-card shadow="hover">
              <template #header>审核参数</template>
              <el-form :model="reviewForm" label-width="80px">
                <el-form-item label="内容">
                  <el-input
                    v-model="reviewForm.content"
                    type="textarea"
                    :rows="6"
                    placeholder="粘贴待审核的内容"
                  />
                </el-form-item>
                <el-form-item label="平台">
                  <el-select v-model="reviewForm.platform" clearable style="width: 100%">
                    <el-option
                      v-for="(label, key) in PLATFORM_LABELS"
                      :key="key"
                      :label="label"
                      :value="key"
                    />
                  </el-select>
                </el-form-item>
                <el-form-item label="严格度">
                  <el-radio-group v-model="reviewForm.strictness">
                    <el-radio-button value="lenient">宽松</el-radio-button>
                    <el-radio-button value="normal">正常</el-radio-button>
                    <el-radio-button value="strict">严格</el-radio-button>
                  </el-radio-group>
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="reviewLoading" @click="handleReview">
                    <el-icon><CircleCheck /></el-icon> 开始审核
                  </el-button>
                </el-form-item>
              </el-form>
            </el-card>
          </el-col>
          <el-col :xs="24" :lg="14">
            <template v-if="reviewResult">
              <el-card shadow="hover" class="review-result-card">
                <div class="review-status">
                  <el-icon v-if="reviewResult.passed" :size="48" class="text-success"
                    ><CircleCheckFilled
                  /></el-icon>
                  <el-icon v-else :size="48" class="text-danger"><CircleCloseFilled /></el-icon>
                  <div>
                    <h3>{{ reviewResult.passed ? '审核通过' : '审核未通过' }}</h3>
                    <el-tag
                      :type="
                        reviewResult.riskLevel === 'high'
                          ? 'danger'
                          : reviewResult.riskLevel === 'medium'
                            ? 'warning'
                            : 'success'
                      "
                    >
                      风险等级:
                      {{
                        reviewResult.riskLevel === 'high'
                          ? '高'
                          : reviewResult.riskLevel === 'medium'
                            ? '中'
                            : '低'
                      }}
                    </el-tag>
                    <el-tag type="info" style="margin-left: 8px"
                      >风险分: {{ reviewResult.score }}</el-tag
                    >
                  </div>
                </div>
                <p class="review-summary">{{ reviewResult.summary }}</p>
              </el-card>

              <el-card v-if="reviewResult.issues.length" shadow="hover" style="margin-top: 16px">
                <template #header
                  ><el-icon :size="16"><WarningFilled /></el-icon> 问题清单 ({{
                    reviewResult.issues.length
                  }})</template
                >
                <div v-for="(issue, i) in reviewResult.issues" :key="i" class="review-issue">
                  <el-tag
                    :type="
                      issue.severity === 'high'
                        ? 'danger'
                        : issue.severity === 'medium'
                          ? 'warning'
                          : 'info'
                    "
                    size="small"
                  >
                    {{
                      issue.severity === 'high' ? '高' : issue.severity === 'medium' ? '中' : '低'
                    }}
                  </el-tag>
                  <span>{{ issue.message }}</span>
                </div>
              </el-card>

              <el-card shadow="hover" style="margin-top: 16px">
                <template #header>情感分析</template>
                <el-row :gutter="16">
                  <el-col :span="8">
                    <div class="sentiment-item">
                      <div class="sentiment-label">情感倾向</div>
                      <div
                        class="sentiment-value"
                        :class="
                          reviewResult.sentiment.label === 'positive'
                            ? 'text-success'
                            : reviewResult.sentiment.label === 'negative'
                              ? 'text-danger'
                              : ''
                        "
                      >
                        {{
                          reviewResult.sentiment.label === 'positive'
                            ? '正面'
                            : reviewResult.sentiment.label === 'negative'
                              ? '负面'
                              : '中性'
                        }}
                      </div>
                    </div>
                  </el-col>
                  <el-col :span="8">
                    <div class="sentiment-item">
                      <div class="sentiment-label">情感分数</div>
                      <div class="sentiment-value">
                        {{ reviewResult.sentiment.score.toFixed(2) }}
                      </div>
                    </div>
                  </el-col>
                  <el-col :span="8">
                    <div class="sentiment-item">
                      <div class="sentiment-label">置信度</div>
                      <div class="sentiment-value">
                        {{ (reviewResult.sentiment.confidence * 100).toFixed(0) }}%
                      </div>
                    </div>
                  </el-col>
                </el-row>
              </el-card>

              <el-card
                v-if="reviewResult.suggestions.length"
                shadow="hover"
                style="margin-top: 16px"
              >
                <template #header
                  ><el-icon :size="16"><Sunny /></el-icon> 修改建议</template
                >
                <ul>
                  <li v-for="(s, i) in reviewResult.suggestions" :key="i">{{ s }}</li>
                </ul>
              </el-card>
            </template>
            <el-card v-else shadow="hover">
              <el-empty description="粘贴内容后点击审核，AI 将检测违规内容和敏感词" />
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  MagicStick,
  CopyDocument,
  Loading,
  Timer,
  TrendCharts,
  Warning,
  CircleCheck,
  InfoFilled,
  CircleCheckFilled,
  CircleCloseFilled,
  EditPen,
  Sunny,
  Search,
  WarningFilled,
  Calendar,
} from '@element-plus/icons-vue'
import { PLATFORM_LABELS } from '@/types'
import {
  generateContent,
  getBestPublishTime,
  predictTrend,
  detectAnomaly,
  reviewContent,
  getAIProviders,
  type ContentResult,
  type PublishTimeRecommendation,
  type TrendPrediction,
  type AnomalyReport,
  type ReviewResult,
} from '@/api/ai'

// ===== State =====
const activeTab = ref('content')
const providerStatus = ref('loading')

onMounted(async () => {
  try {
    await getAIProviders()
    providerStatus.value = 'connected'
  } catch {
    providerStatus.value = 'mock'
  }
})

// Content Generation
const contentForm = ref({
  type: 'video_script' as 'video_script' | 'title' | 'tags' | 'caption',
  topic: '',
  platform: '' as string,
  style: '',
  audience: '',
  reference: '',
  count: 5,
})
const contentLoading = ref(false)
const contentResult = ref<ContentResult | null>(null)

// Publish Optimization
const publishForm = ref({
  platform: 'douyin' as string,
  contentType: '短视频',
  audience: '',
})
const publishLoading = ref(false)
const publishResult = ref<PublishTimeRecommendation | null>(null)

// Trend Prediction
const trendForm = ref({
  metric: 'followers' as 'followers' | 'likes' | 'views' | 'engagement',
  platform: '' as string,
  days: 30,
})
const trendLoading = ref(false)
const trendResult = ref<TrendPrediction | null>(null)

// Anomaly Detection
const anomalyForm = ref({
  dataset: '',
  metric: '',
  sensitivity: 'medium' as 'low' | 'medium' | 'high',
})
const anomalyLoading = ref(false)
const anomalyResult = ref<AnomalyReport | null>(null)

// Content Review
const reviewForm = ref({
  content: '',
  platform: '' as string,
  strictness: 'normal' as 'lenient' | 'normal' | 'strict',
})
const reviewLoading = ref(false)
const reviewResult = ref<ReviewResult | null>(null)

// ===== Handlers =====

async function handleGenerateContent() {
  if (!contentForm.value.topic) {
    ElMessage.warning('请输入主题')
    return
  }
  contentLoading.value = true
  try {
    const res = await generateContent(contentForm.value)
    contentResult.value = res.data
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '生成失败')
  } finally {
    contentLoading.value = false
  }
}

async function handlePublishOptimize() {
  publishLoading.value = true
  try {
    const res = await getBestPublishTime(publishForm.value)
    publishResult.value = res.data
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '分析失败')
  } finally {
    publishLoading.value = false
  }
}

async function handleTrendPredict() {
  trendLoading.value = true
  try {
    const res = await predictTrend(trendForm.value)
    trendResult.value = res.data
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '预测失败')
  } finally {
    trendLoading.value = false
  }
}

async function handleAnomalyDetect() {
  if (!anomalyForm.value.dataset) {
    ElMessage.warning('请输入数据集')
    return
  }
  anomalyLoading.value = true
  try {
    const res = await detectAnomaly(anomalyForm.value)
    anomalyResult.value = res.data
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '检测失败')
  } finally {
    anomalyLoading.value = false
  }
}

async function handleReview() {
  if (!reviewForm.value.content) {
    ElMessage.warning('请输入待审核内容')
    return
  }
  reviewLoading.value = true
  try {
    const res = await reviewContent(reviewForm.value)
    reviewResult.value = res.data
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : '审核失败')
  } finally {
    reviewLoading.value = false
  }
}

// ===== Helpers =====

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return text.replace(/[&<>"']/g, (c) => map[c])
}

function formatContent(text: string): string {
  // 先转义 HTML 实体，防止 XSS，再做 Markdown 转换
  const safe = escapeHtml(text)
  return safe
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^(\d+\.\s)/gm, '<br><strong>$1</strong>')
}

function formatNumber(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

function copyContent() {
  if (contentResult.value) {
    navigator.clipboard.writeText(contentResult.value.content)
    ElMessage.success('已复制到剪贴板')
  }
}
// ===== Init (see onMounted above) =====
</script>

<style scoped>
.ai-assistant {
  padding: 0;
}

.ai-assistant__header {
  margin-bottom: 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-info h2 {
  margin: 0 0 4px;
  font-size: $text-headline;
}

.subtitle {
  color: #6e6e73;
  margin: 0;
  font-size: $text-body;
}

.ai-assistant__tabs {
  min-height: 600px;
}

.result-card {
  min-height: 400px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
  color: #6e6e73;
}

.result-text {
  line-height: 1.8;
  font-size: $text-body;
  color: #f5f5f7;
}

.result-keywords {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.result-keywords .label {
  color: #6e6e73;
  margin-right: 8px;
}

.keyword-tag {
  margin: 2px 4px 2px 0;
}

/* Publish Time Slots */
.time-slots {
  margin-bottom: 16px;
}

.time-slot {
  text-align: center;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: all 0.3s;
}

.time-slot.is-best {
  border-color: #E60012;
  background: #ecf5ff;
}

.slot-rank {
  font-size: $text-caption;
  color: #6e6e73;
}

.slot-time {
  font-size: 18px;
  font-weight: 600;
  margin: 8px 0;
}

.slot-score {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: $text-caption;
  color: #30d158;
}

.slot-reason {
  font-size: $text-caption;
  color: #6e6e73;
  margin-top: 8px;
}

.publish-info h4,
.publish-tips h4 {
  margin: 0 0 8px;
}

.publish-tips ul {
  padding-left: 20px;
  color: #98989d;
}

/* Stats */
.stat-card {
  text-align: center;
}

.stat-label {
  color: #6e6e73;
  font-size: 13px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
}

.text-success {
  color: #30d158;
}

.text-danger {
  color: #ff453a;
}

/* Insights */
.insights-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.insight-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #98989d;
  font-size: $text-body;
}

.recommendations-list {
  padding-left: 20px;
  color: #98989d;
}

.recommendations-list li {
  margin-bottom: 6px;
}

/* Anomaly */
.anomaly-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.anomaly-item:last-child {
  border-bottom: none;
}

.empty-text {
  color: #6e6e73;
  text-align: center;
  padding: $space-lg;
}

/* Review */
.review-result-card {
  margin-bottom: 0;
}

.review-status {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.review-status h3 {
  margin: 0 0 8px;
}

.review-summary {
  color: #98989d;
  margin: 0;
}

.review-issue {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.review-issue:last-child {
  border-bottom: none;
}

.sentiment-item {
  text-align: center;
  padding: 12px;
}

.sentiment-label {
  color: #6e6e73;
  font-size: 13px;
  margin-bottom: 8px;
}

.sentiment-value {
  font-size: 18px;
  font-weight: 600;
}
</style>
