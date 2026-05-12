import { post } from './request'

export interface Violation {
  type: 'SENSITIVE_WORD' | 'BANNED_TOPIC' | 'AD_SUSPICION' | 'CONTACT_INFO' | 'POLITICAL'
  keyword: string
  position: number
  context: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  suggestion?: string
}

export interface ReviewResult {
  passed: boolean
  violations: Violation[]
  score: number
}

export interface QuickCheckResult {
  passed: boolean
  highlights: { word: string; severity: string }[]
}

export const contentReviewApi = {
  review(content: string, title?: string) {
    return post<ReviewResult>('/content-review/review', { content, title })
  },

  quickCheck(text: string) {
    return post<QuickCheckResult>('/content-review/quick-check', { text })
  },
}
