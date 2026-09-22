<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="login-overlay" @click.self="close">
        <div class="login-modal">
          <button class="modal-close" @click="close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <div class="login-header">
            <div class="logo">
              <svg viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2"/>
                <circle cx="20" cy="20" r="8" fill="currentColor"/>
                <circle cx="20" cy="12" r="3" fill="currentColor"/>
              </svg>
            </div>
            <h2>登录账户</h2>
            <p>登录后享受更多服务</p>
          </div>

          <div v-if="notice" class="login-notice">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span>{{ notice }}</span>
          </div>

          <form class="login-form" @submit.prevent="handleLogin">
            <div class="form-group">
              <label>用户名</label>
              <div class="input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                <input v-model="username" type="text" placeholder="请输入用户名" :disabled="loading" />
              </div>
            </div>

            <div class="form-group">
              <label>密码</label>
              <div class="input-wrapper">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="请输入密码" :disabled="loading" />
                <button type="button" class="toggle-pwd" @click="showPassword = !showPassword">
                  <svg v-if="!showPassword" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M1 1l22 22"/>
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="error" class="error-msg">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <span>{{ error }}</span>
            </div>

            <button type="submit" class="btn-login" :disabled="loading || !username || !password">
              <span v-if="loading" class="btn-loading"></span>
              <span>{{ loading ? '登录中...' : '登录' }}</span>
            </button>
          </form>


        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { authState, login, resolveLoginModal, dismissLoginModal } from '../utils/auth'
import { logger } from '../utils/api'

export default {
  name: 'LoginModal',
  data() {
    return {
      username: '',
      password: '',
      showPassword: false,
      localLoading: false,
      error: null
    }
  },
  computed: {
    /** 弹窗可见性由认证模块统一管理，全应用只有这一个实例 */
    visible() {
      return authState.loginVisible
    },
    notice() {
      return authState.loginNotice
    },
    isLoggedIn() {
      return authState.isLoggedIn
    },
    loading() {
      return this.localLoading || authState.loading
    }
  },
  watch: {
    visible(open) {
      // 每次打开时重置表单与错误，避免残留上次输入/失败提示
      if (open) {
        this.username = ''
        this.password = ''
        this.showPassword = false
        this.error = null
      }
    },
    isLoggedIn(val) {
      // 会话恢复或其它途径已登录时，确保弹窗关闭且等待中的操作被放行
      if (val && authState.loginVisible) resolveLoginModal(authState.user)
    }
  },
  methods: {
    close() {
      dismissLoginModal()
    },
    async handleLogin() {
      this.error = null
      // 表单验证
      if (!this.username || this.username.trim().length < 2) {
        this.error = '用户名至少需要2个字符'
        return
      }
      if (!this.password || this.password.length < 6) {
        this.error = '密码至少需要6个字符'
        return
      }
      this.localLoading = true
      try {
        logger.info('Login attempt', { username: this.username })
        const result = await login(this.username.trim(), this.password)
        if (result.success) {
          logger.info('Login successful')
          // 统一由认证模块关闭弹窗并放行等待中的受保护操作
          resolveLoginModal(result.user)
        } else {
          this.error = result.error || '登录失败'
        }
      } catch (e) {
        this.error = '系统错误，请重试'
        logger.error('Login error', e)
      } finally {
        this.localLoading = false
      }
    }
  }
}
</script>

<style scoped>
.login-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 3000; padding: 1rem; }
.login-modal { position: relative; background: var(--bg-card); border: 1px solid var(--border); border-radius: 24px; padding: 2.5rem; width: 100%; max-width: 400px; }
.modal-close { position: absolute; top: 1rem; right: 1rem; background: rgba(255,255,255,0.05); border: none; color: var(--text-secondary); width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; }
.modal-close:hover { background: rgba(255,255,255,0.1); color: var(--text-primary); }
.modal-close svg { width: 18px; height: 18px; }
.login-header { text-align: center; margin-bottom: 2rem; }
.logo { width: 50px; height: 50px; color: var(--primary); margin: 0 auto 1rem; }
.login-header h2 { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; margin-bottom: 0.25rem; }
.login-header p { color: var(--text-secondary); font-size: 0.9rem; }
.login-notice { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; background: rgba(0,217,165,0.08); border: 1px solid rgba(0,217,165,0.2); border-radius: 8px; color: var(--primary); font-size: 0.8rem; margin-bottom: 0; }
.login-notice svg { width: 16px; height: 16px; flex-shrink: 0; }
.login-form { display: flex; flex-direction: column; gap: 1.25rem; }
.form-group { display: flex; flex-direction: column; gap: 0.4rem; }
.form-group label { font-size: 0.85rem; color: var(--text-secondary); }
.input-wrapper { position: relative; display: flex; align-items: center; }
.input-wrapper > svg { position: absolute; left: 1rem; width: 18px; height: 18px; color: var(--text-muted); pointer-events: none; }
.input-wrapper input { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 0.875rem 1rem 0.875rem 2.75rem; color: var(--text-primary); font-size: 0.9rem; transition: all 0.3s; }
.input-wrapper input:focus { outline: none; border-color: var(--primary); background: rgba(0,217,165,0.05); }
.input-wrapper input:disabled { opacity: 0.6; }
.toggle-pwd { position: absolute; right: 0.75rem; background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 0.25rem; }
.toggle-pwd svg { width: 18px; height: 18px; }
.error-msg { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.8rem; background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.2); border-radius: 8px; color: #ff6b6b; font-size: 0.8rem; }
.error-msg svg { width: 16px; height: 16px; flex-shrink: 0; }
.btn-login { display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: var(--gradient-1); color: var(--bg-dark); border: none; padding: 0.875rem; font-size: 0.95rem; font-weight: 600; border-radius: 10px; cursor: pointer; transition: all 0.3s; }
.btn-login:hover:not(:disabled) { box-shadow: 0 8px 25px var(--primary-glow); }
.btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-loading { width: 18px; height: 18px; border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.modal-enter-active { animation: fadeIn 0.3s ease; }
.modal-leave-active { animation: fadeOut 0.2s ease; }
.modal-enter-active .login-modal { animation: scaleIn 0.3s ease; }
.modal-leave-active .login-modal { animation: scaleOut 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
@keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
@keyframes scaleOut { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.9); } }
</style>
