<!--
  App.vue - 应用根组件
  
  功能说明：
  - 整合全局导航栏(NavBar)和页脚(FooterBar)组件
  - 管理路由视图和页面过渡动画
  - 处理全局登录弹窗状态
  
  组件结构：
  - NavBar: 顶部导航栏
  - router-view: 页面内容区域
  - FooterBar: 底部页脚
  - LoginModal: 登录弹窗
-->
<template>
  <div id="app">
    <!-- 导航栏组件 -->
    <NavBar
      :is-logged-in="isLoggedIn"
      :user-name="userName"
    />

    <!-- 主内容区域 -->
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 页脚组件 -->
    <FooterBar />

    <!-- 全局唯一登录弹窗（由认证模块统一调度） -->
    <LoginModal />
  </div>
</template>

<script>
/**
 * 应用根组件
 * 负责整合全局布局组件，并响应会话登录/退出/失效事件
 */
import { authState, onAuthEvent, openLoginModal } from './utils/auth'
import NavBar from './components/NavBar.vue'
import FooterBar from './components/FooterBar.vue'
import LoginModal from './components/LoginModal.vue'

export default {
  name: 'App',
  components: {
    NavBar,
    FooterBar,
    LoginModal
  },
  computed: {
    /**
     * 获取用户登录状态
     * @returns {boolean} 是否已登录
     */
    isLoggedIn() {
      return authState.isLoggedIn
    },
    /**
     * 获取用户名称
     * @returns {string} 用户名，默认'U'
     */
    userName() {
      return authState.user?.name || 'U'
    }
  },
  mounted() {
    // 订阅认证事件：退出或会话失效时离开受保护页面，避免残留旧账户数据
    this.unsubscribeAuth = onAuthEvent((type) => {
      if (type === 'logout' || type === 'session-expired') {
        const protectedRoutes = ['/profile', '/tasks']
        if (protectedRoutes.includes(this.$route.path)) {
          this.$router.replace('/')
        }
      }
      // 受保护路由守卫重定向回首页后，自动拉起登录弹窗（并携带操作提示）
      if (type === 'unauthorized' && this.$route.query.login === 'required') {
        const notice = this.$route.query.notice ? { notice: this.$route.query.notice } : undefined
        openLoginModal(notice)
      }
    })
  },
  beforeUnmount() {
    if (this.unsubscribeAuth) this.unsubscribeAuth()
  }
}
</script>

<style>
/* 
 * 全局样式
 * 包含CSS变量定义、基础重置、页面过渡动画和滚动条样式
 */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&display=swap');

/* 基础重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* CSS变量 - 主题色彩系统 */
:root {
  /* 主色调 */
  --primary: #00D9A5;
  --primary-dark: #00B88A;
  --primary-glow: rgba(0, 217, 165, 0.3);
  
  /* 背景色 */
  --bg-dark: #0A0A0F;
  --bg-card: #12121A;
  --bg-card-hover: #1A1A25;
  
  /* 文字色 */
  --text-primary: #FFFFFF;
  --text-secondary: #8A8A9A;
  --text-muted: #5A5A6A;
  
  /* 边框和渐变 */
  --border: rgba(255, 255, 255, 0.08);
  --gradient-1: linear-gradient(135deg, #00D9A5 0%, #00B4D8 100%);
  --gradient-2: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --shadow-glow: 0 0 60px rgba(0, 217, 165, 0.15);
}

/* 全局body样式 */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--bg-dark);
  color: var(--text-primary);
  min-height: 100vh;
  overflow-x: hidden;
  line-height: 1.6;
}

/* 应用容器 */
#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  padding-top: 100px;
}

/* 页面过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-dark);
}

::-webkit-scrollbar-thumb {
  background: var(--bg-card-hover);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}
</style>
