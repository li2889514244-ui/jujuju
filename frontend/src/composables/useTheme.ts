import { ref, watchEffect } from 'vue'

const THEME_KEY = 'matrixflow-theme'
const isLight = ref(false)

function apply() {
  if (isLight.value) {
    document.documentElement.classList.remove('dark')
    document.documentElement.classList.add('light')
  } else {
    document.documentElement.classList.add('dark')
    document.documentElement.classList.remove('light')
  }
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
