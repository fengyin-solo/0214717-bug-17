<!--
  NavBar.vue - 全局导航栏组件

  功能说明：
  - 显示品牌Logo和导航链接
  - 滚动时自动添加背景模糊效果
  - 根据登录状态显示用户头像或登录按钮
  - 点击登录直接打开全局登录弹窗（全应用唯一实例）
-->
<template>
  <nav class="navbar" :class="{ scrolled: isScrolled }">
    <div class="nav-container">
      <!-- 品牌Logo -->
      <div class="nav-brand" @click="$router.push('/')">
        <div class="logo-icon">
          <svg viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2"/>
            <circle cx="20" cy="20" r="8" fill="currentColor"/>
            <circle cx="20" cy="12" r="3" fill="currentColor"/>
          </svg>
        </div>
        <span class="brand-text">BILLIARD<span class="accent">CLUB</span></span>
      </div>

      <!-- 导航链接 -->
      <div class="nav-links">
        <router-link to="/" class="nav-link">
          <span class="link-text">首页</span>
          <span class="link-indicator"></span>
        </router-link>
        <router-link to="/tables" class="nav-link">
          <span class="link-text">球桌预约</span>
          <span class="link-indicator"></span>
        </router-link>
        <router-link to="/courses" class="nav-link">
          <span class="link-text">教学课程</span>
          <span class="link-indicator"></span>
        </router-link>
        <router-link to="/competitions" class="nav-link">
          <span class="link-text">赛事活动</span>
          <span class="link-indicator"></span>
        </router-link>
        <router-link to="/shop" class="nav-link">
          <span class="link-text">商城</span>
          <span class="link-indicator"></span>
        </router-link>
        <router-link v-if="isLoggedIn" to="/tasks" class="nav-link">
          <span class="link-text">任务中心</span>
          <span class="link-indicator"></span>
        </router-link>

        <!-- 用户头像（已登录） -->
        <router-link v-if="isLoggedIn" to="/profile" class="nav-link profile-link">
          <div class="avatar-mini">{{ userName.charAt(0) }}</div>
        </router-link>

        <!-- 登录按钮（未登录） -->
        <button v-else type="button" class="nav-link login-btn" @click="openLogin()">
          <span>登录</span>
        </button>
      </div>
    </div>
  </nav>
</template>

<script>
/**
 * 导航栏组件
 * 响应滚动事件，动态切换样式
 */
import { openLoginModal } from '../utils/auth'

export default {
  name: 'NavBar',
  props: {
    isLoggedIn: { type: Boolean, default: false },
    userName: { type: String, default: 'U' }
  },
  data() {
    return {
      isScrolled: false // 页面是否已滚动
    }
  },
  mounted() {
    // 监听滚动事件
    window.addEventListener('scroll', this.handleScroll)
  },
  beforeUnmount() {
    // 移除滚动监听
    window.removeEventListener('scroll', this.handleScroll)
  },
  methods: {
    /**
     * 打开全局登录弹窗
     */
    openLogin() {
      openLoginModal()
    },
    /**
     * 处理页面滚动
     * 滚动超过50px时添加背景效果
     */
    handleScroll() {
      this.isScrolled = window.scrollY > 50
    }
  }
}
</script>

<style scoped>
/* 导航栏基础样式 */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: 1.5rem 0;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 滚动后的样式 - 添加背景模糊 */
.navbar.scrolled {
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(20px);
  padding: 1rem 0;
  border-bottom: 1px solid var(--border);
}

.nav-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 3rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* 品牌Logo */
.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  transition: transform 0.3s;
}

.nav-brand:hover { transform: scale(1.02); }

.logo-icon {
  width: 40px;
  height: 40px;
  color: var(--primary);
}

.brand-text {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.accent { color: var(--primary); }

/* 导航链接 */
.nav-links {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-link {
  position: relative;
  color: var(--text-secondary);
  text-decoration: none;
  padding: 0.75rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 500;
  transition: color 0.3s;
  overflow: hidden;
}

.nav-link:hover,
.nav-link.router-link-active {
  color: var(--text-primary);
}

/* 链接下划线指示器 */
.link-indicator {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) scaleX(0);
  width: 20px;
  height: 2px;
  background: var(--primary);
  border-radius: 2px;
  transition: transform 0.3s;
}

.nav-link:hover .link-indicator,
.nav-link.router-link-active .link-indicator {
  transform: translateX(-50%) scaleX(1);
}

/* 登录按钮 */
.login-btn {
  background: var(--gradient-1);
  color: var(--bg-dark) !important;
  border: none;
  border-radius: 10px;
  padding: 0.6rem 1.25rem !important;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.3s;
}

.login-btn:hover {
  transform: scale(1.02);
  box-shadow: 0 5px 15px var(--primary-glow);
}

/* 用户头像 */
.profile-link {
  margin-left: 1rem;
  padding: 0;
}

.avatar-mini {
  width: 40px;
  height: 40px;
  background: var(--gradient-1);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--bg-dark);
  transition: transform 0.3s, box-shadow 0.3s;
}

.avatar-mini:hover {
  transform: scale(1.05);
  box-shadow: 0 0 20px var(--primary-glow);
}
</style>
