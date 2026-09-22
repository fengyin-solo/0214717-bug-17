/**
 * 认证状态管理模块
 *
 * 功能说明：
 * - 管理用户登录状态（单一可信来源 authState）
 * - 处理登录/退出逻辑，处理快速登录/退出竞态
 * - 会话恢复时严格校验令牌（损坏/过期/归属不匹配一律登出）
 * - 持久化认证信息，退出时清除该账号的全部本地数据（资料、任务）
 * - 提供受保护操作的统一入口 requireAuth（全局登录弹窗 + 登录后继续）
 *
 * 使用方式：
 * import { authState, login, logout, isAuthenticated, requireAuth } from '@/utils/auth'
 */

import { reactive } from 'vue'
import { api, logger } from './api'
import {
  AUTH_TOKEN_KEY,
  issueToken,
  verifyToken,
  readStoredToken,
  saveToken,
  clearToken
} from './token'
import { loadProfile, saveProfile, clearProfile } from './accountStore'
import taskStore from './taskStore'

// ==================== 常量定义 ====================

/** localStorage 中存储用户信息的键名（登录态快照，受令牌保护） */
const AUTH_USER_KEY = 'billiard_user'

/** 会话代号：每次成功登录 +1，退出/失效作废，用于丢弃过期的异步响应 */
let sessionEpoch = 0

// ==================== 响应式状态 ====================

/**
 * 认证状态对象（响应式，全局唯一）
 * @property {boolean} isLoggedIn - 是否已登录
 * @property {Object|null} user - 当前用户信息
 * @property {string|null} token - 认证令牌
 * @property {boolean} loading - 是否正在进行认证操作
 * @property {string|null} error - 最近一次错误信息
 * @property {string|null} tokenError - 会话恢复时令牌失效原因
 * @property {boolean} initialized - 会话是否已完成初始化
 */
export const authState = reactive({
  isLoggedIn: false,
  user: null,
  token: null,
  loading: false,
  error: null,
  tokenError: null,
  initialized: false
})

// ==================== 会话事件总线 ====================

/**
 * 轻量事件总线（无第三方依赖）
 * - 'auth-invalid'：令牌失效/过期/被篡改时触发，页面可据此跳转
 * - 'change'：登录状态变化，payload 为 { isLoggedIn, user }
 */
const listeners = new Map()

export function onAuthEvent(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event).add(handler)
  return () => offAuthEvent(event, handler)
}

export function offAuthEvent(event, handler) {
  listeners.get(event)?.delete(handler)
}

function emit(event, payload) {
  listeners.get(event)?.forEach(handler => {
    try {
      handler(payload)
    } catch (e) {
      logger.error('Auth event handler error', e)
    }
  })
}

// ==================== 登录弹窗的全局控制 ====================

/** 登录弹窗可见性（响应式，App.vue 绑定） */
export const loginGate = reactive({
  visible: false,
  /** 登录成功后待继续的受保护操作 */
  pendingAction: null
})

/** 打开全局登录弹窗，可附带登录成功后的回调 */
export function openLoginModal(pendingAction = null) {
  // 已登录无需弹窗
  if (isAuthenticated()) {
    if (typeof pendingAction === 'function') {
      Promise.resolve().then(() => safeRun(pendingAction))
    }
    return
  }
  if (typeof pendingAction === 'function') {
    loginGate.pendingAction = pendingAction
  }
  loginGate.visible = true
}

/** 关闭登录弹窗；cancel=true 表示用户放弃，丢弃待执行操作 */
export function closeLoginModal(cancel = false) {
  loginGate.visible = false
  if (cancel) {
    loginGate.pendingAction = null
  }
}

/**
 * 受保护操作入口：未登录则弹出全局登录框，登录成功后自动继续；
 * 已登录则立即执行。返回 true 表示当前已登录。
 * @param {Function} [action] - 需要登录后执行的操作
 * @returns {boolean}
 */
export function requireAuth(action) {
  if (isAuthenticated()) {
    return true
  }
  openLoginModal(typeof action === 'function' ? action : null)
  return false
}

function safeRun(action) {
  try {
    const ret = action()
    if (ret && typeof ret.catch === 'function') {
      ret.catch(e => logger.error('Pending action failed', e))
    }
  } catch (e) {
    logger.error('Pending action threw', e)
  }
}

// ==================== 公共方法 ====================

/**
 * 初始化认证状态
 * 从 localStorage 恢复登录状态，并严格校验：
 * 1. 令牌存在且结构完整
 * 2. 令牌签名未被篡改（损坏令牌直接拒绝）
 * 3. 令牌未过期
 * 4. 令牌归属的 userId 与本地用户快照一致（不能用 A 的令牌配 B 的资料）
 */
export function initAuth() {
  const tokenCheck = readStoredToken()
  const userStr = safeGetUserStr()

  if (!tokenCheck.valid || !userStr) {
    if (tokenCheck.reason && tokenCheck.reason !== 'missing') {
      logger.warn('Auth restored denied: invalid token', { reason: tokenCheck.reason })
      handleInvalidSession(tokenCheck.reason)
    }
    authState.initialized = true
    return
  }

  let user
  try {
    user = JSON.parse(userStr)
  } catch (e) {
    logger.error('Failed to parse stored user data', e)
    handleInvalidSession('malformed')
    authState.initialized = true
    return
  }

  if (!user || typeof user.id !== 'string' || user.id !== tokenCheck.userId) {
    // 令牌与页面数据对不上（串号/数据损坏），拒绝恢复
    logger.warn('Auth restored denied: token/user ownership mismatch', {
      tokenUserId: tokenCheck.userId,
      storedUserId: user?.id
    })
    handleInvalidSession('ownership_mismatch')
    authState.initialized = true
    return
  }

  // 合并本地已编辑的资料
  const localProfile = loadProfile(user.id)
  if (localProfile) {
    user = { ...user, ...localProfile }
  }

  applySession(tokenCheck, user, localStorage.getItem(AUTH_TOKEN_KEY))
  sessionEpoch += 1
  logger.info('Auth initialized from storage', { userId: user.id })
  authState.initialized = true
}

/**
 * 用户登录
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
 */
export async function login(username, password) {
  authState.loading = true
  authState.error = null

  // 本次登录请求的会话代号；返回时若已退出/被更新登录覆盖，则丢弃结果
  const loginEpoch = sessionEpoch

  try {
    logger.info('Login attempt', { username })
    const result = await api.login(username, password)

    if (result.success) {
      const { user } = result.data

      // 快速登录/退出竞态：等待期间已退出，或被更新的登录覆盖 -> 丢弃
      if (loginEpoch !== sessionEpoch) {
        logger.warn('Login response discarded: session changed during request', {
          loginEpoch,
          currentEpoch: sessionEpoch
        })
        return { success: false, error: '登录状态已变更，请重试' }
      }

      const token = issueToken(user.id)
      applySession({ valid: true, userId: user.id }, user, token)
      persistSession(token, user)

      sessionEpoch += 1
      const pendingAction = loginGate.pendingAction
      loginGate.visible = false
      loginGate.pendingAction = null

      emit('change', { isLoggedIn: true, user })
      logger.info('Login successful', { userId: user.id })

      // 恢复登录前被拦截的受保护操作
      if (pendingAction) {
        Promise.resolve().then(() => safeRun(pendingAction))
      }
      authState.loading = false
      return { success: true, user }
    }
    throw new Error(result.error || '登录失败')
  } catch (error) {
    authState.error = error.message
    logger.error('Login failed', error)
    return { success: false, error: error.message }
  } finally {
    // 竞态场景（登录途中退出）由退出路径复位；正常成功已在上面复位
    if (loginEpoch !== sessionEpoch) {
      authState.loading = false
    }
  }
}

/**
 * 用户退出登录
 * 先作废本地会话（立即生效），再尽力通知服务端；
 * 清除该账号在本地的全部归属数据，避免旧账户数据残留。
 */
export async function logout() {
  const userId = authState.user?.id
  logger.info('Logout', { userId })

  // 立即作废会话，使任何在途响应失效
  sessionEpoch += 1
  const hadSession = authState.isLoggedIn
  resetLocalState()
  clearToken()
  removeStoredUser()

  // 解除任务数据绑定并清除该账号本地数据
  taskStore.clearUserData(userId)
  clearProfile(userId)
  loginGate.pendingAction = null
  loginGate.visible = false

  if (hadSession) {
    emit('change', { isLoggedIn: false, user: null })
  }

  // 服务端清理尽力而为，失败不影响本地退出结果
  try {
    await api.logout()
  } catch (e) {
    logger.warn('Logout API failed', e)
  }
}

/**
 * 检查是否已登录（同时检查令牌是否已过期）
 * @returns {boolean}
 */
export function isAuthenticated() {
  if (!authState.isLoggedIn || !authState.token) return false
  const check = verifyToken(authState.token)
  if (!check.valid) {
    // 运行期间令牌到期（例如长时间挂着页面），就地清理
    logger.warn('Session expired at runtime', { reason: check.reason })
    handleInvalidSession(check.reason)
    return false
  }
  return true
}

/**
 * 获取当前登录用户
 * @returns {Object|null}
 */
export function getCurrentUser() {
  return isAuthenticated() ? authState.user : null
}

/**
 * 更新当前用户资料（同步到响应式状态、本地持久化与 mock 服务端）
 * @param {Object} updates
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function updateCurrentUser(updates) {
  if (!isAuthenticated() || !authState.user) {
    return { success: false, error: '未登录' }
  }
  const userId = authState.user.id
  const result = await api.updateProfile(updates)
  if (!result.success) {
    return { success: false, error: result.error || '保存失败' }
  }
  const merged = saveProfile(userId, { ...authState.user, ...updates })
  if (merged) {
    Object.assign(authState.user, merged)
  } else {
    Object.assign(authState.user, updates)
  }
  persistUser(authState.user)
  return { success: true, user: authState.user }
}

// ==================== 内部方法 ====================

/**
 * 令牌失效统一处理（损坏/过期/归属不匹配/服务端401）
 * @param {string} reason
 * @private
 */
export function handleInvalidSession(reason = 'invalid') {
  const wasLoggedIn = authState.isLoggedIn
  const userId = authState.user?.id

  authState.tokenError = reason
  resetLocalState()
  clearToken()
  removeStoredUser()
  taskStore.clearUserData(userId)
  clearProfile(userId)
  loginGate.visible = false
  loginGate.pendingAction = null
  sessionEpoch += 1

  if (wasLoggedIn) {
    logger.info('Session cleared due to invalid token', { reason })
    emit('change', { isLoggedIn: false, user: null })
  }
  emit('auth-invalid', { reason })
}

/**
 * 将会话应用到响应式状态并绑定数据归属
 * @param {{userId: string}} tokenCheck
 * @param {Object} user
 * @param {string} [token] - 已校验的令牌；恢复会话时使用现有存储令牌
 * @private
 */
function applySession(tokenCheck, user, token) {
  authState.token = token || authState.token
  authState.user = user
  authState.isLoggedIn = true
  authState.error = null
  authState.tokenError = null
  // 任务数据按当前账号隔离
  taskStore.bindUser(tokenCheck.userId)
}

/**
 * 持久化完整会话
 * @private
 */
function persistSession(token, user) {
  saveToken(token)
  persistUser(user)
}

function persistUser(user) {
  try {
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
  } catch (e) {
    logger.error('Persist user failed', e)
  }
}

function safeGetUserStr() {
  try {
    return localStorage.getItem(AUTH_USER_KEY)
  } catch (e) {
    return null
  }
}

function removeStoredUser() {
  try {
    localStorage.removeItem(AUTH_USER_KEY)
  } catch (e) {
    // ignore
  }
}

/**
 * 重置响应式认证状态（不直接发事件）
 * @private
 */
function resetLocalState() {
  authState.isLoggedIn = false
  authState.user = null
  authState.token = null
  authState.error = null
  authState.loading = false
  taskStore.bindUser(null)
}

// ==================== 默认导出 ====================

export default {
  authState,
  loginGate,
  initAuth,
  login,
  logout,
  isAuthenticated,
  getCurrentUser,
  updateCurrentUser,
  requireAuth,
  openLoginModal,
  closeLoginModal,
  handleInvalidSession,
  onAuthEvent,
  offAuthEvent
}
