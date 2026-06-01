import { ref } from 'vue'

const COMPANION_DEFAULT_URL = 'http://localhost:5409'

/**
 * Standalone helper to resolve the companion URL without Vue reactivity.
 * Usable from plain .ts modules (e.g. api/analytics.ts).
 */
export async function getCompanionUrl(): Promise<string | null> {
  const baseUrl = import.meta.env.VITE_COMPANION_URL || ''
  if (baseUrl) return baseUrl
  try {
    const resp = await fetch(`${COMPANION_DEFAULT_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    if (resp.ok) return COMPANION_DEFAULT_URL
  } catch {
    /* companion not running, graceful degradation */
  }
  return null
}

/**
 * Vue composable for dynamic companion URL detection with reactive availability.
 * Use inside Vue component setup() / <script setup>.
 */
export function useCompanionUrl() {
  const baseUrl = import.meta.env.VITE_COMPANION_URL || ''
  const available = ref(!!baseUrl)

  async function healthCheck(): Promise<string | null> {
    const url = await getCompanionUrl()
    available.value = !!url
    return url
  }

  return { baseUrl, available, healthCheck }
}
