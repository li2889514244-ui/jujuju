import { ref } from 'vue'

const COMPANION_CANDIDATE_URLS = ['http://127.0.0.1:5409', 'http://localhost:5409']

/**
 * Standalone helper to resolve the companion URL without Vue reactivity.
 * Usable from plain .ts modules (e.g. api/analytics.ts).
 */
export async function getCompanionUrl(): Promise<string | null> {
  const baseUrl = import.meta.env.VITE_COMPANION_URL || ''
  if (baseUrl) return baseUrl
  for (const url of COMPANION_CANDIDATE_URLS) {
    try {
      const resp = await fetch(`${url}/health`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(2500),
      })
      if (resp.ok) return url
    } catch {
      /* try next local companion endpoint */
    }
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
