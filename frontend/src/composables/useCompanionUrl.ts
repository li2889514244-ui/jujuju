import { ref } from 'vue'

const COMPANION_CANDIDATE_URLS = ['http://127.0.0.1:5409', 'http://localhost:5409']

function createTimeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms)
  }
  if (typeof AbortController === 'undefined') return undefined

  const controller = new AbortController()
  window.setTimeout(() => controller.abort(), ms)
  return controller.signal
}

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
        signal: createTimeoutSignal(2500),
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
