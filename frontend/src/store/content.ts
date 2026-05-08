import { defineStore } from 'pinia'
import { ref } from 'vue'
import { contentApi } from '@/api/content'
import type { Content, PublishTask, ContentForm } from '@/types'

export const useContentStore = defineStore('content', () => {
  const contents = ref<Content[]>([])
  const publishTasks = ref<PublishTask[]>([])
  const currentContent = ref<Content | null>(null)
  const loading = ref(false)
  const total = ref(0)

  async function fetchContents(params?: Record<string, unknown>) {
    loading.value = true
    try {
      const res = await contentApi.getList(params)
      contents.value = res.data.list
      total.value = res.data.total
    } finally {
      loading.value = false
    }
  }

  async function fetchContentDetail(id: string) {
    loading.value = true
    try {
      const res = await contentApi.getDetail(id)
      currentContent.value = res.data
    } finally {
      loading.value = false
    }
  }

  async function saveContent(form: ContentForm) {
    const res = await contentApi.save(form)
    return res.data
  }

  async function publishContent(contentId: string, accountIds: string[], scheduledAt?: string) {
    const res = await contentApi.publish({ contentId, accountIds, scheduledAt })
    await fetchPublishTasks()
    return res.data
  }

  async function fetchPublishTasks(params?: Record<string, unknown>) {
    const res = await contentApi.getPublishTasks(params)
    publishTasks.value = res.data.list
  }

  async function cancelPublish(taskId: string) {
    await contentApi.cancelPublish(taskId)
    await fetchPublishTasks()
  }

  async function deleteContent(id: string) {
    await contentApi.delete(id)
    await fetchContents()
  }

  return {
    contents,
    publishTasks,
    currentContent,
    loading,
    total,
    fetchContents,
    fetchContentDetail,
    saveContent,
    publishContent,
    fetchPublishTasks,
    cancelPublish,
    deleteContent,
  }
})
