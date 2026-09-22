/**
 * 认证状态管理模块
 *
 * 功能说明：
 * - 管理用户登录状态，处理登录/退出逻辑
 * - 会话以单个原子键持久化（令牌与用户资料成对写入，避免对不上）
 * - 会话恢复时本地验签/验过期，并与服务端资料对账
 * - 登录/退出使用“世代号”防止快速登录退出时旧请求污染新会话
 * - 统一管理全局登录弹窗，页面通过 requireLogin() 申请登录，杜绝重复弹窗
 * - 损坏/过期令牌由 API 层 401 统一回收，自动退出并广播会话事件
 *
 * 使用方式：
 * import { authState, login, logout, isAuthenticated, requireLogin } from '@/utils/auth'
 */

import { reactive } from 'vue'
import { logger, api } from './api'
import { mockServer } from './mockServer'

// ==================== 常量定义 ====================

/** localStorage中存储会话（令牌+用户）的原子键名 */
const SESSION_KEY = 'billiard_session_v1'

/** 旧版本遗留的存储键（结构不可信，启动时统一清理） */
const LEGACY_KEYS = ['billiard_token', 'billiard_user', 'billiard_user_tasks']

// ==================== 响应式状态 ====================

/**
 * 认证状态对象（响应式，全局单例）
 *
 * @property {boolean} initialized - 会话恢复是否完成
 * @property {boolean} isLoggedIn - 是否已登录
 * @property {Object|null} user - 当前用户信息（与令牌同属一个账号）
 * @property {string|null} token - 认证令牌
 * @property {boolean} loading - 是否正在执行登录
 * @property {string|null} error - 最近一次错误信息
 * @property {boolean} loginVisible - 全局登录弹窗是否可见
 * @property {string|null} loginNotice - 登录弹窗提示语（如“登录后即可预约球桌”）
 */
export const authState = reactive({
  initialized: false,
  isLoggedIn: false,
  user: null,
  token: null,
  loading: false,
  error: null,
  loginVisible: false,
  loginNotice: null
})

// ==================== 会话事件 ====================

/**
 * 事件类型：
 * - login: 新会话建立（参数 user）
 * - logout: 主动退出
 * - session-expired: 令牌损坏/过期/被服务端拒绝，会话被自动回收
 * - unauthorized: 未登录状态下访问受保护资源被拒绝
 */
const authListeners = new Set()

/**
 * 订阅认证事件
 * @param {(type: string, detail?: Object) => void} fn
 * @returns {() => void} 取消订阅函数
 */
export function onAuthEvent(fn) {
  authListeners.add(fn)
  return () => authListeners.delete(fn)
}

function emitAuthEvent(type, detail) {
  authListeners.forEach(fn => {
    try {
      fn(type, detail)
    } catch (e) {
      logger.error('Auth event listener error', e)
    }
  })
}

// ==================== 会话持久化（原子读写） ====================

/**
 * 清理旧版本遗留数据。
 * 旧结构把令牌、用户、任务分开存储，退出或刷新时可能只清掉一部分，
 * 导致“令牌与页面数据对不上”，这里在每次启动时统一移除。
 */
function cleanupLegacyStorage() {
  LEGACY_KEYS.forEach(key => localStorage.removeItem(key))
}

function persistSession(token, user) {
  // 单键成对写入，避免只写了一半（令牌有、用户没有或相反）
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ token, user, savedAt: Date.now() })
  )
}

function readSession() {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw)
    if (session && typeof session.token === 'string' && session.user && session.user.id) {
      return session
    }
  } catch (e) {
    logger.warn('Stored session is corrupted, discarding', e)
  }
  return null
}

function clearSessionStorage() {
  localStorage.removeItem(SESSION_KEY)
}

function applySession(token, user) {
  authState.token = token
  authState.user = user
  authState.isLoggedIn = true
  authState.error = null
}

// ==================== 令牌本地校验 ====================

/**
 * 本地校验令牌：结构、签名（模拟模式）、过期时间、账号归属。
 * 真实模式下只解析过期声明，签名由服务端校验。
 *
 * @param {string} token
 * @returns {{valid: boolean, payload?: Object, reason?: string}}
 */
function verifySessionToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return { valid: false, reason: 'missing-token' }
  }

  // 模拟模式：HMAC 签名 + 过期校验（损坏/篡改/过期都会失败）
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    return mockServer.verifyToken(token)
  }

  // 真实模式：解析 JWT 负载中的过期时间，签名以服务端校验为准
  try {
    const payloadPart = token.split('.')[1]
    if (!payloadPart) return { valid: false, reason: 'malformed-token' }
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(decodeURIComponent(escape(atob(normalized))))
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
      return { valid: false, reason: 'expired', payload }
    }
    return { valid: true, payload }
  } catch {
    return { valid: false, reason: 'malformed-token' }
  }
}

// ==================== 登录/退出竞态保护 ====================

/**
 * 认证“世代号”：每次新的登录或退出都会递增。
 * 较早发起的异步请求返回时若世代号已变化，结果一律丢弃，
 * 防止“退出后旧登录请求又把账号写回来”等快速操作冲突。
 */
let authEpoch = 0

/** initAuth 返回的 Promise，供需要等待会话恢复完成的调用方使用 */
let restorePromise = null

// ==================== 会话恢复 ====================

/**
 * 初始化认证状态（应用启动时调用）
 *
 * 流程：
 * 1. 清理旧版本遗留存储
 * 2. 读取原子会话，令牌本地验签/验过期，且令牌 uid 必须与用户 id 一致
 * 3. 校验通过则先恢复页面状态，再异步与服务端资料对账
 *
 * @returns {Promise<boolean>} 恢复完成后是否处于已登录状态
 */
export function initAuth() {
  if (restorePromise) return restorePromise

  cleanupLegacyStorage()
  authState.initialized = false

  const session = readSession()
  if (session) {
    const verdict = verifySessionToken(session.token)
    const ownershipOk = verdict.valid && verdict.payload?.uid === session.user.id
    if (ownershipOk) {
      applySession(session.token, session.user)
      logger.info('Auth restored from storage', { userId: session.user.id })
    } else {
      // 损坏/过期/令牌与资料不属于同一账号：一律丢弃，不进入错误的已登录态
      clearSessionStorage()
      logger.warn('Stored session rejected', { reason: verdict.reason })
    }
  }

  restorePromise = syncProfileFromServer().finally(() => {
    authState.initialized = true
  })

  return restorePromise
}

/** 会话恢复的别名，语义化导出 */
export const restoreSession = initAuth

/**
 * 与服务端对账当前账号资料，确保页面数据始终以服务端为准
 */
async function syncProfileFromServer() {
  if (!authState.isLoggedIn) return false

  const tokenAtCall = authState.token
  const result = await api.getMe()
  // 请求期间已退出或换号：丢弃过期结果
  if (authState.token !== tokenAtCall || !authState.isLoggedIn) return false

  if (result.success) {
    authState.user = result.data
    persistSession(authState.token, result.data)
    return true
  }

  // 401 已由 request 统一交给 handleUnauthorized 回收会话
  return false
}

// ==================== 登录 / 退出 ====================

/**
 * 用户登录
 *
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Promise<{success: boolean, user?: Object, error?: string, stale?: boolean}>}
 */
export async function login(username, password) {
  authState.loading = true
  authState.error = null
  const epoch = ++authEpoch

  try {
    logger.info('Login attempt', { username })

    const result = await api.login(username, password)

    // 登录等待期间发生了退出或新的登录：丢弃本次结果，绝不写入旧会话
    if (epoch !== authEpoch) {
      logger.warn('Discarding stale login result', { epoch, current: authEpoch })
      return { success: false, error: '登录已被新的操作取代', stale: true }
    }

    if (result.success) {
      const { token, user } = result.data
      persistSession(token, user)
      applySession(token, user)

      logger.info('Login successful', { userId: user.id })
      emitAuthEvent('login', { user })
      return { success: true, user }
    }

    throw new Error(result.error || '登录失败')
  } catch (error) {
    if (epoch === authEpoch) {
      authState.error = error.message
    }
    logger.error('Login failed', error)
    return { success: false, error: error.message }
  } finally {
    if (epoch === authEpoch) {
      authState.loading = false
    }
  }
}

/**
 * 用户退出登录
 * 幂等：未登录、接口失败、快速重复调用都安全
 *
 * @returns {Promise<void>}
 */
export async function logout() {
  ++authEpoch // 推进世代号，使进行中的登录请求结果作废
  const userId = authState.user?.id

  try {
    if (authState.token) {
      await api.logout()
    }
  } catch (e) {
    // 即使退出接口失败，本地会话也必须清理干净
    logger.warn('Logout API failed, clearing local session anyway', e)
  } finally {
    clearSession()
    dismissLoginModal()
    logger.info('Logout completed', { userId })
    emitAuthEvent('logout', { userId })
  }
}

/** 清空内存中的会话与本地持久化（不广播事件） */
function clearSession() {
  authState.isLoggedIn = false
  authState.user = null
  authState.token = null
  authState.error = null
  authState.loading = false
  clearSessionStorage()
}

/**
 * 处理受保护接口返回的 401（令牌损坏、过期、服务端拒绝）。
 * 由 api.js 统一调用，幂等：重复 401 不会反复弹窗。
 *
 * @param {string} message 服务端给出的失效原因
 */
export function handleUnauthorized(message = '登录已过期，请重新登录') {
  if (authState.isLoggedIn || readSession()) {
    const userId = authState.user?.id
    clearSession()
    dismissLoginModal()
    logger.warn('Session invalidated by server', { userId, message })
    emitAuthEvent('session-expired', { message, userId })
  } else {
    emitAuthEvent('unauthorized', { message })
  }
}

// ==================== 登录态查询 ====================

/**
 * 检查是否已登录（每次调用实时校验令牌有效性）
 * 令牌若在页面停留期间过期，会立即回收会话并返回 false。
 *
 * @returns {boolean}
 */
export function isAuthenticated() {
  if (!authState.isLoggedIn || !authState.token) return false

  const verdict = verifySessionToken(authState.token)
  if (verdict.valid) return true

  if (verdict.reason === 'expired') {
    handleUnauthorized('登录已过期，请重新登录')
  } else {
    handleUnauthorized('登录状态无效，请重新登录')
  }
  return false
}

/**
 * 获取当前登录用户
 * @returns {Object|null}
 */
export function getCurrentUser() {
  return authState.user
}

/**
 * 更新当前用户资料并同步到会话存储
 * @param {Object} partial 待合并的字段
 * @returns {Object|null}
 */
export function setCurrentUser(partial) {
  if (!authState.user || !authState.token) return null
  authState.user = { ...authState.user, ...partial }
  persistSession(authState.token, authState.user)
  return authState.user
}

/**
 * 重新与服务端校验会话（用于浏览器返回/页面重新显示等场景）
 * @returns {Promise<boolean>}
 */
export async function revalidateSession() {
  if (!isAuthenticated()) return false
  const result = await api.getMe()
  if (result.success) {
    authState.user = result.data
    persistSession(authState.token, result.data)
    return true
  }
  // 401 已由 request 层统一回收会话
  return false
}

// ==================== 全局登录弹窗 ====================

/**
 * 全局只有一个登录弹窗（挂在 App.vue），由本模块统一调度。
 * 页面不再各自挂载 LoginModal，从根本上消除“已登录仍反复弹窗/多层弹窗”。
 */
let loginResolver = null

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * 打开全局登录弹窗
 * @param {Object} [options]
 * @param {string} [options.notice] 提示语（说明登录后可执行的操作）
 * @returns {Promise<Object>} 登录成功 resolve(用户)，用户关闭弹窗 reject
 */
export function openLoginModal({ notice } = {}) {
  if (authState.isLoggedIn) return Promise.resolve(authState.user)

  authState.loginNotice = notice || null
  authState.error = null

  if (!loginResolver) {
    loginResolver = createDeferred()
  }
  authState.loginVisible = true
  return loginResolver.promise
}

/**
 * 受保护操作的统一入口：未登录则拉起弹窗，登录成功后继续，取消则中止
 *
 * @param {string} [actionLabel] 操作名称，用于弹窗提示，如“预约球桌”
 * @returns {Promise<boolean>} 是否最终处于已登录状态
 */
export async function requireLogin(actionLabel) {
  if (isAuthenticated()) return true
  try {
    await openLoginModal(actionLabel ? { notice: `登录后即可${actionLabel}` } : undefined)
    return true
  } catch {
    return false
  }
}

/**
 * 登录成功：关闭弹窗并放行所有等待中的受保护操作
 * 由全局 LoginModal 在登录成功后调用
 */
export function resolveLoginModal(user) {
  authState.loginVisible = false
  authState.loginNotice = null
  const resolver = loginResolver
  loginResolver = null
  if (resolver) resolver.resolve(user ?? authState.user)
}

/**
 * 用户主动关闭弹窗：拒绝所有等待中的受保护操作
 */
export function dismissLoginModal() {
  authState.loginVisible = false
  authState.loginNotice = null
  const resolver = loginResolver
  loginResolver = null
  if (resolver) resolver.reject(new Error('用户取消了登录'))
}

// ==================== 默认导出 ====================

/**
 * 仅供单元测试使用：重置内存状态与会话恢复缓存，保留 localStorage 中的会话，
 * 以便用例模拟“刷新页面后从存储恢复”的场景。需要彻底清空时由用例自行清存储。
 */
export function __resetAuthForTests() {
  authEpoch += 1
  authState.isLoggedIn = false
  authState.user = null
  authState.token = null
  authState.error = null
  authState.loading = false
  authState.initialized = false
  authState.loginVisible = false
  authState.loginNotice = null
  loginResolver = null
  restorePromise = null
}

export default {
  authState,
  initAuth,
  restoreSession,
  login,
  logout,
  isAuthenticated,
  getCurrentUser,
  setCurrentUser,
  revalidateSession,
  handleUnauthorized,
  onAuthEvent,
  openLoginModal,
  requireLogin,
  resolveLoginModal,
  dismissLoginModal
}
