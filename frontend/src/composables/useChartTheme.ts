/**
 * 统一的 ECharts 主题适配器（Deep Space Quiet）
 *
 * 用法：
 *   const { chartTheme, accent, palette, mergeOption } = useChartTheme()
 *   const option = mergeOption({
 *     xAxis: { type: 'category', data: labels },
 *     series: [{ type: 'line', data: values }],
 *   })
 *
 * 设计令牌与 _variables.scss / global.scss 保持一致。
 */

import type { EChartsOption } from 'echarts'

// ── Tokens（与 _variables.scss 一一对应，避免运行时读取 CSS） ──
const ACCENT_500 = '#6366f1'
const ACCENT_400 = '#818cf8'
const ACCENT_300 = '#a5b0ff'
const SUCCESS = '#10b981'
const WARNING = '#f59e0b'
const DANGER = '#ef4444'
const INFO = '#06b6d4'

const BG_OVERLAY = '#1c1f2e'
const BORDER_BASE = 'rgba(255, 255, 255, 0.08)'
const BORDER_SUBTLE = 'rgba(255, 255, 255, 0.06)'

const TEXT_PRIMARY = '#e6e8f0'
const TEXT_SECONDARY = '#a0a4b8'
const TEXT_TERTIARY = '#6b7290'

// ── 多系列调色板（强对比 + 暗色友好） ──
const palette = [
  ACCENT_500, // indigo
  INFO, // cyan
  SUCCESS, // emerald
  WARNING, // amber
  '#a855f7', // purple
  DANGER, // red
  '#ec4899', // pink
  '#14b8a6', // teal
]

/**
 * 基础主题：所有 ECharts 实例都应当与这个对象合并
 */
const baseTheme: Partial<EChartsOption> = {
  color: palette,
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily:
      "'Inter', 'Noto Sans SC', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    color: TEXT_SECONDARY,
  },
  grid: {
    left: 48,
    right: 24,
    top: 32,
    bottom: 32,
    containLabel: true,
  },
  tooltip: {
    backgroundColor: BG_OVERLAY,
    borderColor: BORDER_BASE,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: {
      color: TEXT_PRIMARY,
      fontSize: 12,
      fontWeight: 500,
    },
    extraCssText: 'box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5); border-radius: 10px;',
    axisPointer: {
      lineStyle: { color: BORDER_BASE, width: 1 },
      crossStyle: { color: BORDER_BASE, width: 1 },
      shadowStyle: { color: 'rgba(99, 102, 241, 0.06)' },
    },
  },
  legend: {
    textStyle: {
      color: TEXT_SECONDARY,
      fontSize: 12,
    },
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 8,
    itemGap: 16,
  },
  xAxis: {
    axisLine: { lineStyle: { color: BORDER_SUBTLE } },
    axisTick: { show: false },
    axisLabel: {
      color: TEXT_TERTIARY,
      fontSize: 11,
      margin: 12,
    },
    splitLine: { show: false },
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: TEXT_TERTIARY,
      fontSize: 11,
      margin: 12,
    },
    splitLine: {
      lineStyle: { color: BORDER_SUBTLE, type: 'dashed' },
    },
  },
}

/**
 * 平台品牌色（用于跨平台对比图）
 */
const platformColors: Record<string, string> = {
  douyin: '#ffffff',
  kuaishou: '#ff6a21',
  xiaohongshu: '#ff3d57',
  bilibili: '#00a1d6',
  weibo: '#ff8200',
  wechat: '#07c160',
  weixin: '#07c160',
}

/**
 * 深度合并工具：将用户传入的 option 与 baseTheme 合并，
 * 用户的字段优先覆盖（特别是 xAxis/yAxis 内部需要保留 type/data）
 */
function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result: any = { ...target }
  for (const key in source) {
    const srcVal = source[key]
    const tgtVal = result[key]
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal, srcVal)
    } else if (srcVal !== undefined) {
      result[key] = srcVal
    }
  }
  return result
}

export function useChartTheme() {
  /**
   * 合并主题与用户配置
   */
  function mergeOption(option: EChartsOption): EChartsOption {
    return deepMerge(baseTheme as EChartsOption, option)
  }

  return {
    /** 完整基础主题对象 */
    chartTheme: baseTheme,
    /** 主强调色 */
    accent: ACCENT_500,
    accentLight: ACCENT_400,
    accentLighter: ACCENT_300,
    /** 语义色 */
    success: SUCCESS,
    warning: WARNING,
    danger: DANGER,
    info: INFO,
    /** 多系列调色板 */
    palette,
    /** 平台品牌色映射 */
    platformColors,
    /** 文本色 */
    textPrimary: TEXT_PRIMARY,
    textSecondary: TEXT_SECONDARY,
    textTertiary: TEXT_TERTIARY,
    /** 边框色 */
    borderBase: BORDER_BASE,
    borderSubtle: BORDER_SUBTLE,
    /** 工具函数 */
    mergeOption,
  }
}
