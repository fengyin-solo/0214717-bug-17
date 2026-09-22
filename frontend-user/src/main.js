import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAuth, handleInvalidSession } from './utils/auth'
import { setUnauthorizedHandler } from './utils/api'
import { logger } from './utils/api'

// API 层检测到令牌失效/过期/越权时，统一交由认证层清理会话
setUnauthorizedHandler((reason) => {
  handleInvalidSession(reason)
})

// 初始化认证状态（严格校验本地令牌）
initAuth()

// 全局错误处理
window.addEventListener('error', (event) => {
  logger.error('Global error', { message: event.message, filename: event.filename, lineno: event.lineno })
})

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', { reason: event.reason })
})

logger.info('Application starting')

const app = createApp(App)
app.use(router)
app.mount('#app')

logger.info('Application mounted')
