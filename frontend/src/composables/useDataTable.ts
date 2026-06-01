import { ref, type Ref } from 'vue'

/**
 * Shared composable for data-fetching views.
 * Standardizes loading / error / data / refresh pattern.
 *
 * @param fetchFn - Async function that returns an array of items of type T.
 * @returns Reactive loading, error, data, and a refresh function.
 */
export function useDataTable<T>(fetchFn: () => Promise<T[]>) {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const data = ref<T[]>([]) as Ref<T[]>

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      data.value = await fetchFn()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载失败'
      error.value = msg
    } finally {
      loading.value = false
    }
  }

  return { loading, error, data, refresh }
}
