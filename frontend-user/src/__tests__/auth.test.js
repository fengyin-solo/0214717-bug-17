/**
 * 认证模块单元测试
 *
 * 测试范围：
 * - 登录功能（成功/失败/加载态）
 * - 退出功能（状态、令牌、归属数据全部清除）
 * - 会话恢复：损坏令牌、过期令牌、令牌与资料归属不匹配
 * - 快速登录/退出竞态
 * - 受保护操作 requireAuth：未登录弹窗，登录成功后自动继续
 * - 多账号资料归属隔离
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  authState,
  loginGate,
  login,
  logout,
  isAuthenticated,
  initAuth,
  getCurrentUser,
  requireAuth,
  closeLoginModal
} from '../utils/auth'
import { issueToken, AUTH_TOKEN_KEY } from '../utils/token'
import { api } from '../utils/api'

// ==================== Mock设置 ====================

const localStorageMock = {
  store: {},
  getItem: vi.fn(key => (Object.prototype.hasOwnProperty.call(localStorageMock.store, key) ? localStorageMock.store[key] : null)),
  setItem: vi.fn((key, value) => { localStorageMock.store[key] = String(value) }),
  removeItem: vi.fn(key => { delete localStorageMock.store[key] }),
  clear: vi.fn(() => { localStorageMock.store = {} })
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true })

const USER_KEY = 'billiard_user'
const userA = { id: 'U20260001', name: '张三', points: 2580 }
const userB = { id: 'U20260002', name: '李四', points: 680 }

// ==================== 测试用例 ====================

describe('Auth Module', () => {

  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()

    authState.isLoggedIn = false
    authState.user = null
    authState.token = null
    authState.error = null
    authState.tokenError = null
    authState.loading = false
    loginGate.visible = false
    loginGate.pendingAction = null
  })

  // ---------- 登录测试 ----------

  describe('login', () => {
    it('should login successfully with correct credentials', async () => {
      const result = await login('user', '123456')

      expect(result.success).toBe(true)
      expect(result.user).toBeDefined()
      expect(authState.isLoggedIn).toBe(true)
      expect(authState.user).toBeDefined()
      expect(authState.token).toBeDefined()
      expect(authState.error).toBeNull()
    })

    it('should fail with incorrect username', async () => {
      const result = await login('wronguser', '123456')

      expect(result.success).toBe(false)
      expect(result.error).toContain('密码')
      expect(authState.isLoggedIn).toBe(false)
      expect(authState.user).toBeNull()
    })

    it('should fail with incorrect password', async () => {
      const result = await login('user', 'wrongpassword')

      expect(result.success).toBe(false)
      expect(authState.isLoggedIn).toBe(false)
    })

    it('should store a signed token in localStorage on success', async () => {
      await login('user', '123456')

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        AUTH_TOKEN_KEY,
        expect.stringMatching(/^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/)
      )
    })

    it('should store user snapshot in localStorage on success', async () => {
      await login('user', '123456')

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        USER_KEY,
        expect.any(String)
      )
    })

    it('should clear loading state after login completes', async () => {
      await login('user', '123456')
      expect(authState.loading).toBe(false)
    })

    it('should set error state on failure', async () => {
      await login('wrong', 'wrong')
      expect(authState.error).toBeTruthy()
    })

    it('should login as different accounts with different token ownership', async () => {
      const a = await login('user', '123456')
      expect(a.user.id).toBe('U20260001')
      await logout()

      const b = await login('lisi', '123456')
      expect(b.success).toBe(true)
      expect(b.user.id).toBe('U20260002')
      expect(authState.user.id).toBe('U20260002')
    })
  })

  // ---------- 退出测试 ----------

  describe('logout', () => {
    it('should clear auth state on logout', async () => {
      await login('user', '123456')
      await logout()

      expect(authState.isLoggedIn).toBe(false)
      expect(authState.user).toBeNull()
      expect(authState.token).toBeNull()
    })

    it('should remove token from localStorage', async () => {
      await login('user', '123456')
      await logout()

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY)
    })

    it('should remove user snapshot from localStorage', async () => {
      await login('user', '123456')
      await logout()

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(USER_KEY)
    })

    it('should remove the account-scoped tasks data on logout', async () => {
      await login('user', '123456')
      await logout()

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        'billiard_user_tasks_U20260001'
      )
    })

    it('should work even if not logged in', async () => {
      await expect(logout()).resolves.not.toThrow()
    })
  })

  // ---------- 状态检查测试 ----------

  describe('isAuthenticated', () => {
    it('should return false when not logged in', () => {
      expect(isAuthenticated()).toBe(false)
    })

    it('should return true when logged in', async () => {
      await login('user', '123456')
      expect(isAuthenticated()).toBe(true)
    })

    it('should return false after logout', async () => {
      await login('user', '123456')
      await logout()
      expect(isAuthenticated()).toBe(false)
    })
  })

  describe('getCurrentUser', () => {
    it('should return null when not logged in', () => {
      expect(getCurrentUser()).toBeNull()
    })

    it('should return user object when logged in', async () => {
      await login('user', '123456')
      const user = getCurrentUser()
      expect(user).toBeTruthy()
      expect(user.name).toBe('张三')
    })
  })

  // ---------- 会话恢复（刷新页面） ----------

  describe('initAuth - session restore', () => {
    it('should restore a valid session from storage', () => {
      const token = issueToken(userA.id)
      localStorageMock.store[AUTH_TOKEN_KEY] = token
      localStorageMock.store[USER_KEY] = JSON.stringify(userA)

      initAuth()

      expect(authState.isLoggedIn).toBe(true)
      expect(authState.token).toBe(token)
      expect(authState.user.id).toBe(userA.id)
    })

    it('should not restore if no stored data', () => {
      initAuth()
      expect(authState.isLoggedIn).toBe(false)
      expect(authState.token).toBeNull()
    })

    it('should reject corrupted (arbitrary string) tokens and clear data', () => {
      localStorageMock.store[AUTH_TOKEN_KEY] = 'this-is-not-a-valid-token'
      localStorageMock.store[USER_KEY] = JSON.stringify(userA)

      expect(() => initAuth()).not.toThrow()

      expect(authState.isLoggedIn).toBe(false)
      expect(authState.token).toBeNull()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY)
    })

    it('should reject tokens with tampered signature', () => {
      const real = issueToken(userA.id)
      const [payload] = real.split('.')
      localStorageMock.store[AUTH_TOKEN_KEY] = `${payload}.deadbeef`
      localStorageMock.store[USER_KEY] = JSON.stringify(userA)

      initAuth()

      expect(authState.isLoggedIn).toBe(false)
      expect(authState.tokenError).toBe('bad_signature')
    })

    it('should reject malformed payload tokens', () => {
      localStorageMock.store[AUTH_TOKEN_KEY] = '!!!.###'
      localStorageMock.store[USER_KEY] = JSON.stringify(userA)

      initAuth()

      expect(authState.isLoggedIn).toBe(false)
    })

    it('should reject expired tokens', () => {
      // 已过期 1 秒
      const expired = issueToken(userA.id, -1000)
      localStorageMock.store[AUTH_TOKEN_KEY] = expired
      localStorageMock.store[USER_KEY] = JSON.stringify(userA)

      initAuth()

      expect(authState.isLoggedIn).toBe(false)
      expect(authState.tokenError).toBe('expired')
      // 过期令牌也要清除，避免反复进入错误状态
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(AUTH_TOKEN_KEY)
    })

    it('should reject when token user does not match stored user (cross-account)', () => {
      // 令牌属于 A，本地资料却是 B —— 对不上，拒绝恢复
      localStorageMock.store[AUTH_TOKEN_KEY] = issueToken(userA.id)
      localStorageMock.store[USER_KEY] = JSON.stringify(userB)

      initAuth()

      expect(authState.isLoggedIn).toBe(false)
      expect(authState.tokenError).toBe('ownership_mismatch')
    })

    it('should handle invalid JSON user snapshot', () => {
      localStorageMock.store[AUTH_TOKEN_KEY] = issueToken(userA.id)
      localStorageMock.store[USER_KEY] = 'invalid json'

      expect(() => initAuth()).not.toThrow()
      expect(authState.isLoggedIn).toBe(false)
    })

    it('should not restore if only token exists', () => {
      localStorageMock.store[AUTH_TOKEN_KEY] = issueToken(userA.id)
      initAuth()
      expect(authState.isLoggedIn).toBe(false)
    })

    it('should survive refresh: valid restored session is still authenticated', () => {
      localStorageMock.store[AUTH_TOKEN_KEY] = issueToken(userA.id)
      localStorageMock.store[USER_KEY] = JSON.stringify(userA)

      initAuth()

      expect(isAuthenticated()).toBe(true)
      expect(getCurrentUser().id).toBe(userA.id)
    })
  })

  // ---------- 快速登录 / 退出竞态 ----------

  describe('rapid login/logout race', () => {
    it('should discard login response if logout happens during the request', async () => {
      const loginPromise = login('user', '123456')
      // 登录请求尚未返回就退出
      await logout()
      const result = await loginPromise

      expect(result.success).toBe(false)
      // 迟到的登录响应不能把账号写回登录态
      expect(authState.isLoggedIn).toBe(false)
      expect(authState.user).toBeNull()
      expect(authState.token).toBeNull()
    })
  })

  // ---------- 受保护操作 requireAuth ----------

  describe('requireAuth', () => {
    it('should open the global login modal when not authenticated', () => {
      const action = vi.fn()
      const allowed = requireAuth(action)

      expect(allowed).toBe(false)
      expect(loginGate.visible).toBe(true)
      expect(loginGate.pendingAction).toBe(action)
      expect(action).not.toHaveBeenCalled()
    })

    it('should not open modal again if already logged in', async () => {
      await login('user', '123456')
      const action = vi.fn()
      const allowed = requireAuth(action)

      expect(allowed).toBe(true)
      expect(loginGate.visible).toBe(false)
    })

    it('should resume the pending protected action after successful login', async () => {
      const action = vi.fn()
      requireAuth(action)

      expect(loginGate.visible).toBe(true)

      await login('user', '123456')
      // 等待微任务执行
      await Promise.resolve()

      expect(action).toHaveBeenCalledTimes(1)
      expect(loginGate.visible).toBe(false)
      expect(loginGate.pendingAction).toBeNull()
    })

    it('should drop pending action when the modal is cancelled', () => {
      const action = vi.fn()
      requireAuth(action)
      closeLoginModal(true)

      expect(loginGate.visible).toBe(false)
      expect(loginGate.pendingAction).toBeNull()
    })
  })

  // ---------- 响应式 ----------

  describe('authState reactivity', () => {
    it('should update isLoggedIn on login', async () => {
      expect(authState.isLoggedIn).toBe(false)
      await login('user', '123456')
      expect(authState.isLoggedIn).toBe(true)
    })

    it('should update user on login', async () => {
      expect(authState.user).toBeNull()
      await login('user', '123456')
      expect(authState.user).not.toBeNull()
      expect(authState.user.id).toBeDefined()
    })
  })
})

// 标记 apiLogin 被引入以保证 token 签发链路可追溯（登录服务端签发能力）
describe('server-issued token', () => {
  beforeEach(() => {
    localStorageMock.clear()
  })

  it('api login returns a verifiable token bound to the user', async () => {
    const res = await api.login('user', '123456')
    expect(res.success).toBe(true)
    localStorageMock.store[AUTH_TOKEN_KEY] = res.data.token
    localStorageMock.store[USER_KEY] = JSON.stringify(userA)

    initAuth()
    expect(authState.isLoggedIn).toBe(true)
    expect(authState.user.id).toBe('U20260001')
  })
})
