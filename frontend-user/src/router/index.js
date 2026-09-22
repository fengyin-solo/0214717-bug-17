import { createRouter, createWebHistory } from 'vue-router'
import { logger } from '../utils/api'
import { isAuthenticated, onAuthEvent } from '../utils/auth'
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
  // 受保护页面：必须登录，刷新或直接访问时未登录会被重定向回首页
  {
    path: '/profile',
    name: 'Profile',
    component: Profile,
    meta: { requiresAuth: true }
  },
  {
    path: '/tasks',
    name: 'Tasks',
    component: Tasks,
    meta: { requiresAuth: true }
  },
  // 兼容历史跳转：/login 不是真实页面，统一回到首页（由登录弹窗承接登录）
  { path: '/login', redirect: '/' },
  // 未知路由回到首页，避免刷新落在错误状态
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  logger.info('Navigation', { from: from.path, to: to.path })

  if (to.meta.requiresAuth && !isAuthenticated()) {
    logger.warn('Navigation blocked: auth required', { to: to.path })
    next({ path: '/', query: { redirect: to.fullPath } })
    return
  }
  next()
})

// 浏览受保护页面期间令牌失效（过期/损坏/被登出）：退回首页，避免残留他人数据视图
onAuthEvent('auth-invalid', () => {
  const current = router.currentRoute.value
  if (current.meta.requiresAuth) {
    router.replace({ path: '/', query: { redirect: current.fullPath } })
  }
})

export default router
