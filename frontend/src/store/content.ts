import { defineStore } from 'pinia'
import { ref } from 'vue'
import { contentApi } from '@/api/content'
import type { Content, PublishTask, ContentForm, PaginatedResponse } from '@/types'

/** Extract items from PaginatedResponse with backward compat for legacy field names. */
function extractItems<T>(
  data: PaginatedResponse<T> & { posts?: T[]; list?: T[] },
): T[] {
  return data.items || data.posts || data.list || []
}

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
      const data = res.data
      contents.value = extractItems(data)
      total.value = data.total || 0
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

  async function publishContent(
    title: string,
    desc: string,
    accountIds: string[],
    tags?: string[],
    scheduledAt?: string,
  ) {
    const res = await contentApi.publish({
      title,
      content: desc,
      accountIds,
      tags,
      publishAt: scheduledAt,
    })
    await fetchPublishTasks()
    return res.data
  }

  async function fetchPublishTasks(params?: Record<string, unknown>) {
    const res = await contentApi.getPublishTasks(params)
    const data = res.data as PaginatedResponse<PublishTask> & { items?: PublishTask[] }
    publishTasks.value = data.items || (data as unknown as PublishTask[]) || []
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
