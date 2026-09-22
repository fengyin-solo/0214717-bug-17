import { createRouter, createWebHistory } from 'vue-router'
import { isAuthenticated, initAuth } from '../utils/auth'
import { logger } from '../utils/api'
import Home from '../views/Home.vue'
import Tables from '../views/Tables.vue'
import Courses from '../views/Courses.vue'
import Competitions from '../views/Competitions.vue'
import Shop from '../views/Shop.vue'
import Profile from '../views/Profile.vue'
import Tasks from '../views/Tasks.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/tables', name: 'Tables', component: Tables },
  { path: '/courses', name: 'Courses', component: Courses },
  { path: '/competitions', name: 'Competitions', component: Competitions },
  { path: '/shop', name: 'Shop', component: Shop },
  // 受保护页面：必须登录，且数据只属于当前账号
  {
    path: '/profile',
    name: 'Profile',
    component: Profile,
    meta: { requiresAuth: true, notice: '登录后查看个人中心' }
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: Tasks,
    meta: { requiresAuth: true, notice: '登录后查看任务中心' }
  },
  // 历史上退出登录曾跳转到不存在的 /login，这里兜底重定向到首页
  { path: '/login', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

/**
 * 标记会话恢复是否已完成。
 * main.js 会在挂载前先执行 initAuth；这里仅为直接创建 router 使用的场景兜底。
 */
let authReady = false
initAuth().finally(() => {
  authReady = true
})

/**
 * 全局前置守卫：
 * 1. 首次导航前等待会话恢复完成，避免刷新瞬间错误地跳转
 * 2. 受保护页面必须登录（含令牌有效性校验），否则回到首页并唤起登录弹窗
 *    （弹窗由 App.vue 监听 unauthorized 事件统一打开，全应用只弹一次）
 */
router.beforeEach(async (to) => {
  if (!authReady) {
    await initAuth()
  }

  if (to.meta.requiresAuth && !isAuthenticated()) {
    logger.info('Access blocked: authentication required', { to: to.path })
    return {
      path: '/',
      query: { login: 'required', redirect: to.fullPath, notice: to.meta.notice || '请先登录' }
    }
  }

  logger.info('Navigation allowed', { to: to.path })
  return true
})

export default router
