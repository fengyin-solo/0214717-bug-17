/**
 * 认证模块单元测试
 *
 * 覆盖场景：
 * - 登录 / 退出 / 状态管理 / 原子化持久化
 * - 会话恢复：正常恢复、损坏令牌、篡改令牌、过期、令牌与资料不匹配
 * - 快速登录退出竞态（旧请求不得污染新会话）
 * - 401 会话回收（模拟令牌在使用中过期）
 * - 全局登录弹窗：去重、取消、成功放行
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  authState,
  login,
  logout,
  isAuthenticated,
  initAuth,
  getCurrentUser,
  onAuthEvent,
  requireLogin,
  openLoginModal,
  resolveLoginModal,
  dismissLoginModal,
  handleUnauthorized,
  __resetAuthForTests
} from '../utils/auth'
import { mockServer } from '../utils/mockServer'

// ==================== Mock设置 ====================

const localStorageMock = {
  store: {},
  getItem: vi.fn(key => (key in localStorageMock.store ? localStorageMock.store[key] : null)),
  setItem: vi.fn((key, value) => { localStorageMock.store[key] = String(value) }),
  removeItem: vi.fn(key => { delete localStorageMock.store[key] }),
  clear: vi.fn(() => { localStorageMock.store = {} }),
  key: vi.fn(index => Object.keys(localStorageMock.store)[index] || null),
  get length() { return Object.keys(localStorageMock.store).length }
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true })

const SESSION_KEY = 'billiard_session_v1'

let events = []
let unsubscribe = null

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
  mockServer.test.resetAll()
  __resetAuthForTests()
  events = []
  unsubscribe = onAuthEvent((type, detail) => events.push({ type, detail }))
})

afterEach(() => {
  if (unsubscribe) unsubscribe()
  vi.useRealTimers()
})

// ==================== 登录 ====================

describe('login', () => {
  it('使用正确账号密码登录成功', async () => {
    const result = await login('user', '123456')

    expect(result.success).toBe(true)
    expect(result.user).toBeDefined()
    expect(authState.isLoggedIn).toBe(true)
    expect(authState.user).toBeDefined()
    expect(authState.token).toBeDefined()
    expect(authState.error).toBeNull()
    expect(events.some(e => e.type === 'login')).toBe(true)
  })

  it('错误用户名登录失败且不写入会话', async () => {
    const result = await login('wronguser', '123456')

    expect(result.success).toBe(false)
    expect(result.error).toContain('密码')
    expect(authState.isLoggedIn).toBe(false)
    expect(authState.user).toBeNull()
    expect(localStorageMock.store[SESSION_KEY]).toBeUndefined()
  })

  it('错误密码登录失败', async () => {
    const result = await login('user', 'wrongpassword')

    expect(result.success).toBe(false)
    expect(result.error).toContain('密码')
    expect(authState.isLoggedIn).toBe(false)
  })

  it('登录成功后以原子键持久化令牌与用户（成对存储）', async () => {
    const result = await login('user', '123456')

    const raw = localStorageMock.store[SESSION_KEY]
    expect(raw).toBeDefined()
    const session = JSON.parse(raw)
    expect(session.token).toBe(result.data?.token ?? authState.token)
    expect(session.user.id).toBe('U20260001')
    // 旧的分离式存储键不应再出现
    expect(localStorageMock.store['billiard_token']).toBeUndefined()
    expect(localStorageMock.store['billiard_user']).toBeUndefined()
  })

  it('失败后 loading 复位', async () => {
    await login('wrong', 'wrong')
    expect(authState.loading).toBe(false)
    expect(authState.error).toBeDefined()
  })
})

// ==================== 退出 ====================

describe('logout', () => {
  it('退出后清空内存状态与持久化会话', async () => {
    await login('user', '123456')
    expect(authState.isLoggedIn).toBe(true)

    await logout()

    expect(authState.isLoggedIn).toBe(false)
    expect(authState.user).toBeNull()
    expect(authState.token).toBeNull()
    expect(localStorageMock.store[SESSION_KEY]).toBeUndefined()
    expect(events.some(e => e.type === 'logout')).toBe(true)
  })

  it('未登录时退出也安全（幂等）', async () => {
    await expect(logout()).resolves.toBeUndefined()
    expect(authState.isLoggedIn).toBe(false)
  })

  it('退出会关闭可能打开的登录弹窗并拒绝等待中的操作', async () => {
    const p = openLoginModal()
    p.catch(() => {}) // 退出会拒绝该 Promise，这里消费掉避免未处理拒绝
    expect(authState.loginVisible).toBe(true)
    await logout()
    await expect(p).rejects.toThrow('用户取消了登录')
    expect(authState.loginVisible).toBe(false)
  })
})

// ==================== 快速登录/退出竞态 ====================

describe('登录/退出竞态', () => {
  it('登录请求进行中发起退出，旧登录结果不得写回会话', async () => {
    const loginPromise = login('user', '123456')
    // 在登录请求返回前退出（世代号被推进）
    await logout()
    const result = await loginPromise

    expect(result.stale).toBe(true)
    expect(authState.isLoggedIn).toBe(false)
    expect(authState.user).toBeNull()
    expect(localStorageMock.store[SESSION_KEY]).toBeUndefined()
  })

  it('连续发起两次登录，先返回的旧结果不会污染新登录', async () => {
    const first = login('user', '123456')
    const second = login('user', '123456')
    const [r1, r2] = await Promise.all([first, second])

    // 至少有一次成功；最终状态必须一致（已登录且只有一个会话）
    expect(authState.isLoggedIn).toBe(true)
    expect(r1.success || r2.success).toBe(true)
    const sessionCount = Object.keys(localStorageMock.store).filter(k => k === SESSION_KEY).length
    expect(sessionCount).toBe(1)
  })
})

// ==================== isAuthenticated ====================

describe('isAuthenticated', () => {
  it('未登录返回 false', () => {
    expect(isAuthenticated()).toBe(false)
  })

  it('登录后返回 true', async () => {
    await login('user', '123456')
    expect(isAuthenticated()).toBe(true)
  })

  it('退出后返回 false', async () => {
    await login('user', '123456')
    await logout()
    expect(isAuthenticated()).toBe(false)
  })

  it('本地令牌在页面停留期间过期时立即回收会话', async () => {
    await login('user', '123456')
    // 将服务端时钟拨到令牌有效期之后
    mockServer.test.setClockOffset(8 * 24 * 60 * 60 * 1000)

    expect(isAuthenticated()).toBe(false)
    expect(authState.isLoggedIn).toBe(false)
    expect(authState.token).toBeNull()
    expect(events.some(e => e.type === 'session-expired')).toBe(true)
  })
})

describe('getCurrentUser', () => {
  it('未登录返回 null', () => {
    expect(getCurrentUser()).toBeNull()
  })

  it('登录后返回当前用户', async () => {
    await login('user', '123456')
    expect(getCurrentUser().name).toBe('张三')
  })
})

// ==================== 会话恢复（刷新页面） ====================

describe('initAuth 会话恢复', () => {
  it('完整有效的会话可被恢复', async () => {
    await login('user', '123456')
    const token = authState.token
    const user = authState.user
    __resetAuthForTests()
    expect(authState.isLoggedIn).toBe(false)

    await initAuth()

    expect(authState.isLoggedIn).toBe(true)
    expect(authState.token).toBe(token)
    expect(authState.user.id).toBe(user.id)
  })

  it('令牌损坏（被篡改）时拒绝恢复并清理存储', async () => {
    await login('user', '123456')
    const session = JSON.parse(localStorageMock.store[SESSION_KEY])
    session.token = session.token.slice(0, -3) + 'abc'
    localStorageMock.store[SESSION_KEY] = JSON.stringify(session)
    __resetAuthForTests()

    await initAuth()

    expect(authState.isLoggedIn).toBe(false)
    expect(authState.token).toBeNull()
    expect(localStorageMock.store[SESSION_KEY]).toBeUndefined()
  })

  it('会话 JSON 损坏时安全丢弃，不抛错', async () => {
    localStorageMock.store[SESSION_KEY] = 'not a json'
    await expect(initAuth()).resolves.toBe(false)
    expect(authState.isLoggedIn).toBe(false)
  })

  it('只有令牌没有用户资料时拒绝恢复', async () => {
    localStorageMock.store[SESSION_KEY] = JSON.stringify({ token: 'mock.xxx.yyy' })
    await initAuth()
    expect(authState.isLoggedIn).toBe(false)
  })

  it('令牌中的账号与存储的用户资料不匹配时拒绝恢复', async () => {
    // 为另一个账号签发令牌，却配上 user 的资料 —— 典型的“令牌与页面数据对不上”
    const other = mockServer.test.createUser({ uid: 'U_ATTACKER', username: 'attacker', password: '123456' })
    const attackerToken = mockServer.test.issueToken(other.uid)
    localStorageMock.store[SESSION_KEY] = JSON.stringify({
      token: attackerToken,
      user: { id: 'U20260001', name: '张三' },
      savedAt: Date.now()
    })
    __resetAuthForTests()

    await initAuth()

    expect(authState.isLoggedIn).toBe(false)
    expect(localStorageMock.store[SESSION_KEY]).toBeUndefined()
  })

  it('恢复后与服务端对账，页面资料以服务端为准', async () => {
    await login('user', '123456')
    // 模拟服务端资料被更新，而本地会话里是旧名字
    const session = JSON.parse(localStorageMock.store[SESSION_KEY])
    session.user = { ...session.user, name: '本地旧名字' }
    localStorageMock.store[SESSION_KEY] = JSON.stringify(session)
    __resetAuthForTests()

    await initAuth()

    expect(authState.isLoggedIn).toBe(true)
    expect(authState.user.name).toBe('张三')
    expect(JSON.parse(localStorageMock.store[SESSION_KEY]).user.name).toBe('张三')
  })

  it('启动时自动清理旧版本的分离式存储键', async () => {
    localStorageMock.store['billiard_token'] = 'old-token'
    localStorageMock.store['billiard_user'] = JSON.stringify({ id: 'U20260001' })
    localStorageMock.store['billiard_user_tasks'] = '[]'

    await initAuth()

    expect(localStorageMock.store['billiard_token']).toBeUndefined()
    expect(localStorageMock.store['billiard_user']).toBeUndefined()
    expect(localStorageMock.store['billiard_user_tasks']).toBeUndefined()
  })
})

// ==================== 401 会话回收（令牌过期/损坏发生在请求期间） ====================

describe('handleUnauthorized', () => {
  it('已登录状态收到 401：清空会话并广播 session-expired', async () => {
    await login('user', '123456')

    handleUnauthorized('登录已过期，请重新登录')

    expect(authState.isLoggedIn).toBe(false)
    expect(authState.user).toBeNull()
    expect(localStorageMock.store[SESSION_KEY]).toBeUndefined()
    const event = events.find(e => e.type === 'session-expired')
    expect(event).toBeDefined()
    expect(event.detail.message).toContain('过期')
  })

  it('重复 401 只广播一次（幂等，不反复弹窗）', async () => {
    await login('user', '123456')
    handleUnauthorized('过期')
    handleUnauthorized('过期')
    handleUnauthorized('过期')
    expect(events.filter(e => e.type === 'session-expired').length).toBe(1)
  })

  it('未登录状态的 401 广播 unauthorized 而不是 session-expired', () => {
    handleUnauthorized('请先登录')
    expect(events.some(e => e.type === 'unauthorized')).toBe(true)
    expect(events.some(e => e.type === 'session-expired')).toBe(false)
  })
})

// ==================== 全局登录弹窗 ====================

describe('全局登录弹窗', () => {
  it('未登录打开弹窗；已登录时直接 resolve，不显示弹窗', async () => {
    const pending = openLoginModal()
    expect(authState.loginVisible).toBe(true)
    dismissLoginModal()
    await expect(pending).rejects.toBeDefined()
    expect(authState.loginVisible).toBe(false)

    await login('user', '123456')
    await expect(openLoginModal()).resolves.toBe(authState.user)
    expect(authState.loginVisible).toBe(false)
  })

  it('重复打开只有一个等待者，登录成功后统一放行', async () => {
    const p1 = openLoginModal({ notice: '登录后即可预约球桌' })
    const p2 = openLoginModal({ notice: '登录后即可报名' })
    expect(authState.loginVisible).toBe(true)
    expect(authState.loginNotice).toBeTruthy()

    resolveLoginModal({ id: 'U20260001' })

    await expect(Promise.all([p1, p2])).resolves.toHaveLength(2)
    expect(authState.loginVisible).toBe(false)
  })

  it('requireLogin：未登录弹窗取消后中止；登录成功后通过', async () => {
    const cancelled = requireLogin('预约球桌')
    expect(authState.loginVisible).toBe(true)
    dismissLoginModal()
    expect(await cancelled).toBe(false)

    const pending = requireLogin('预约球桌')
    expect(authState.loginVisible).toBe(true)
    await login('user', '123456')
    resolveLoginModal(authState.user)
    expect(await pending).toBe(true)
  })
})
