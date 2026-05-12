import { get, post, del } from './request'

export interface Competitor {
  id: string
  platform: string
  platformUserId: string
  nickname: string
  avatar?: string
  bio?: string
  followers: number
  following: number
  note?: string
  createdAt: string
  snapshots?: CompetitorSnapshot[]
}

export interface CompetitorSnapshot {
  id: string
  date: string
  followers: number
  views: number
  likes: number
  comments: number
  posts: number
}

export const competitorsApi = {
  getList(params?: Record<string, unknown>) {
    return get<{ competitors: Competitor[]; total: number }>('/competitors', params)
  },

  getDetail(id: string) {
    return get<Competitor>(`/competitors/${id}`)
  },

  create(data: {
    platform: string
    platformUserId: string
    nickname: string
    avatar?: string
    bio?: string
    note?: string
  }) {
    return post<Competitor>('/competitors', data)
  },

  remove(id: string) {
    return del(`/competitors/${id}`)
  },

  compare(ids: string[], days = 7) {
    return get<Competitor[]>('/competitors/compare', { ids: ids.join(','), days })
  },
}
