import { get, post, del } from './request'
import type { Content, ContentForm, PublishTask, PublishForm, PaginatedResponse } from '@/types'

export const contentApi = {
  getList(params?: Record<string, unknown>) {
    return get<PaginatedResponse<Content>>('/content', params)
  },

  getDetail(id: string) {
    return get<Content>(`/content/${id}`)
  },

  save(form: ContentForm) {
    const formData = new FormData()
    if (form.id) formData.append('id', form.id)
    formData.append('title', form.title)
    formData.append('description', form.description)
    formData.append('tags', JSON.stringify(form.tags))
    if (form.videoFile) formData.append('video', form.videoFile)
    if (form.coverFile) formData.append('cover', form.coverFile)

    return post<Content>('/content', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  delete(id: string) {
    return del(`/content/${id}`)
  },

  publish(form: PublishForm) {
    return post<PublishTask[]>('/content/batch-publish', form)
  },

  getPublishTasks(params?: Record<string, unknown>) {
    return get<PaginatedResponse<PublishTask>>('/content/scheduled', params)
  },

  cancelPublish(taskId: string) {
    return post(`/content/${taskId}/cancel`)
  },

  retryPublish(taskId: string) {
    return post(`/content/${taskId}/retry`)
  },
}
