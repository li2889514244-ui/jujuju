import { ref, watchEffect } from 'vue'

const THEME_KEY = 'matrixflow-theme'
const isLight = ref(false)

function apply() {
  document.documentElement.classList.toggle('light', isLight.value)
}

export function useTheme() {
  // Init from localStorage
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light') isLight.value = true
  } catch {}

  apply()

  watchEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, isLight.value ? 'light' : 'dark')
    } catch {}
    apply()
  })

  function toggle() {
    isLight.value = !isLight.value
  }

  return { isLight, toggle }
}
