import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAuth, revalidateSession, isAuthenticated } from './utils/auth'
import { logger } from './utils/api'

// 全局错误处理
window.addEventListener('error', (event) => {
  logger.error('Global error', { message: event.message, filename: event.filename, lineno: event.lineno })
})

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection', { reason: event.reason })
})

/**
 * 页面重新显示（刷新后恢复、浏览器前进/后退命中 bfcache）时，
 * 重新校验当前会话：令牌若已损坏或过期，立即退出错误的已登录状态。
 */
window.addEventListener('pageshow', (event) => {
  if (event.persisted && isAuthenticated()) {
    revalidateSession()
  }
})

logger.info('Application starting')

// 先恢复会话再挂载，避免受保护页面在恢复完成前闪现错误状态
initAuth().finally(() => {
  const app = createApp(App)
  app.use(router)
  app.mount('#app')
  logger.info('Application mounted', { initialized: true })
})
