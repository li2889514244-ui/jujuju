import { get, post } from './request'

// ===== Types =====

export interface GenerateContentParams {
  type: 'video_script' | 'title' | 'tags' | 'caption'
  topic: string
  platform?: string
  audience?: string
  style?: string
  reference?: string
  count?: number
}

export interface ContentResult {
  type: string
  content: string
  suggestions?: string[]
  keywords?: string[]
  stats?: Record<string, unknown>
}

export interface OptimizePublishParams {
  platform: string
  contentType?: string
  audience?: string
  historicalData?: string
}

export interface PublishTimeRecommendation {
  bestSlots: Array<{ day: string; hour: number; score: number; reason: string }>
  avoidSlots: Array<{ day: string; hour: number; reason: string }>
  frequency: { daily: number; weekly: number; description: string }
  tips: string[]
}

export interface PredictTrendParams {
  metric: 'followers' | 'likes' | 'views' | 'engagement'
  platform?: string
  days?: number
  historicalData?: string
}

export interface TrendPrediction {
  metric: string
  currentValue: number
  predictedValue: number
  growthRate: number
  trend: {
    direction: 'up' | 'down' | 'stable'
    slope: number
    r2: number
    predicted: number[]
    forecast: number[]
  }
  insights: string[]
  recommendations: string[]
}

export interface DetectAnomalyParams {
  dataset?: string
  metric?: string
  platform?: string
  sensitivity?: 'low' | 'medium' | 'high'
}

export interface AnomalyReport {
  anomalies: Array<{ index: number; value: number; zScore: number; type: string }>
  summary: string
  riskLevel: 'low' | 'medium' | 'high'
  possibleCauses: string[]
  recommendations: string[]
  statistics: { mean: number; stdDev: number; min: number; max: number; dataPoints: number }
}

export interface ReviewContentParams {
  content: string
  contentType?: string
  platform?: string
  strictness?: 'lenient' | 'normal' | 'strict'
}

export interface ReviewResult {
  passed: boolean
  riskLevel: 'low' | 'medium' | 'high'
  score: number
  issues: Array<{
    type: string
    severity: string
    message: string
    word?: string
    position?: number
  }>
  sentiment: {
    score: number
    label: string
    confidence: number
    positiveWords: string[]
    negativeWords: string[]
  }
  suggestions: string[]
  summary: string
}

// ===== API Calls =====

/** 智能内容生成 */
export function generateContent(params: GenerateContentParams) {
  return post<ContentResult>('/ai/content/generate', params)
}

/** 批量内容生成 */
export function generateBatchContent(items: GenerateContentParams[]) {
  return post<ContentResult[]>('/ai/content/batch', items)
}

/** 快速标题生成 */
export function generateTitles(topic: string, platform?: string, count?: number) {
  return post<string[]>('/ai/content/titles', { topic, platform, count })
}

/** 快速标签推荐 */
export function generateTags(topic: string, platform?: string) {
  return post<string[]>('/ai/content/tags', { topic, platform })
}

/** 最佳发布时间推荐 */
export function getBestPublishTime(params: OptimizePublishParams) {
  return post<PublishTimeRecommendation>('/ai/publish/best-time', params)
}

/** 发布频率优化 */
export function getPublishFrequency(params: OptimizePublishParams) {
  return post<{ frequency: string; tips: string[] }>('/ai/publish/frequency', params)
}

/** 趋势预测 */
export function predictTrend(params: PredictTrendParams) {
  return post<TrendPrediction>('/ai/trend/predict', params)
}

/** 数据异常检测 */
export function detectAnomaly(params: DetectAnomalyParams) {
  return post<AnomalyReport>('/ai/anomaly/detect', params)
}

/** 账号风险检测 */
export function detectAccountRisk(data: {
  followers: number[]
  engagement: number[]
  publishFrequency: number[]
}) {
  return post<{ riskScore: number; issues: string[]; recommendations: string[] }>(
    '/ai/anomaly/account-risk',
    data,
  )
}

/** 内容审核 */
export function reviewContent(params: ReviewContentParams) {
  return post<ReviewResult>('/ai/review', params)
}

/** 获取AI能力列表 */
export function getAICapabilities() {
  return get<Record<string, string[]>>('/ai/capabilities')
}

/** 获取AI提供商列表 */
export function getAIProviders() {
  return get<string[]>('/ai/providers')
}
