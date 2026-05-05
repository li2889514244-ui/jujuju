import { get, post, del } from './request'
import type { Content, ContentForm, PublishTask, PublishForm, PaginatedResponse } from '@/types'

export const contentApi = {
  getList(params?: Record<string, unknown>) {
    return get<PaginatedResponse<Content>>('/contents', params)
  },

  getDetail(id: string) {
    return get<Content>(`/contents/${id}`)
  },

  save(form: ContentForm) {
    const formData = new FormData()
    if (form.id) formData.append('id', form.id)
    formData.append('title', form.title)
    formData.append('description', form.description)
    formData.append('tags', JSON.stringify(form.tags))
    if (form.videoFile) formData.append('video', form.videoFile)
    if (form.coverFile) formData.append('cover', form.coverFile)

    return post<Content>('/contents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  delete(id: string) {
    return del(`/contents/${id}`)
  },

  publish(form: PublishForm) {
    return post<PublishTask[]>('/contents/publish', form)
  },

  getPublishTasks(params?: Record<string, unknown>) {
    return get<PaginatedResponse<PublishTask>>('/contents/publish-tasks', params)
  },

  cancelPublish(taskId: string) {
    return post(`/contents/publish-tasks/${taskId}/cancel`)
  },

  retryPublish(taskId: string) {
    return post(`/contents/publish-tasks/${taskId}/retry`)
  },
}
