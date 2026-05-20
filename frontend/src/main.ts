import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import App from './App.vue'
import router from './router'
import './assets/styles/global.scss'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use(ElementPlus, { locale: zhCn as any, size: 'default' })

// 图标已通过 unplugin-vue-components 按需自动导入，无需手动全局注册

// 全局错误边界：捕获未处理的 Vue 错误
app.config.errorHandler = (err, instance, info) => {
  console.error('[Vue Global Error]', err)
  console.error('Component:', instance)
  console.error('Info:', info)
  // 可在此上报到错误监控平台（如 Sentry）
}

app.mount('#app')
