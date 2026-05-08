/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module 'nprogress' {
  const NProgress: {
    start: () => void
    done: () => void
    configure: (options: { showSpinner?: boolean }) => void
  }
  export default NProgress
}

declare module 'element-plus/es/locale/lang/zh-cn' {
  const zhCn: Record<string, unknown>
  export default zhCn
}
