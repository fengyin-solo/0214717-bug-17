/**
 * 认证与权限集成测试（用户旅程）
 *
 * 串联模拟：快速登录退出、刷新恢复、过期回收、跨账号越权、浏览器返回重验
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  authState,
  login,
  logout,
  initAuth,
  requireLogin,
  resolveLoginModal,
  dismissLoginModal,
  revalidateSession,
  onAuthEvent,
  __resetAuthForTests
} from '../utils/auth'
import { api } from '../utils/api'
import { mockServer } from '../utils/mockServer'

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
let off = null

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
  mockServer.test.resetAll()
  __resetAuthForTests()
  events = []
  off = onAuthEvent((type, detail) => events.push({ type, detail }))
})

afterEach(() => {
  off && off()
  mockServer.test.setClockOffset(0)
})

describe('集成旅程', () => {
  it('登录→受保护操作→退出→页面无旧账号数据残留', async () => {
    // 1. 登录
    const loginResult = await login('user', '123456')
    expect(loginResult.success).toBe(true)

    // 2. 受保护操作：拉取任务并预约
    const tasksBefore = await api.getTasks()
    expect(tasksBefore.success).toBe(true)
    const initialCount = tasksBefore.data.length

    const booking = await api.bookTable({
      table: mockServer.catalog.tables[2],
      date: '2026-05-01',
      time: '14:00 - 16:00',
      duration: 1
    })
    expect(booking.success).toBe(true)
    expect((await api.getTasks()).data.length).toBe(initialCount + 1)

    // 3. 模拟刷新页面：重新走会话恢复
    __resetAuthForTests()
    expect(authState.isLoggedIn).toBe(false)
    await initAuth()
    expect(authState.isLoggedIn).toBe(true)
    expect(authState.user.name).toBe('张三')
    // 刷新后任务仍然存在且归属当前账号
    expect((await api.getTasks()).data.length).toBe(initialCount + 1)

    // 4. 退出：内存与存储都清空，受保护接口立即 401
    await logout()
    expect(authState.user).toBeNull()
    expect(localStorageMock.store[SESSION_KEY]).toBeUndefined()
    const afterLogout = await api.getTasks()
    expect(afterLogout.status).toBe(401)
    expect(events.some(e => e.type === 'logout')).toBe(true)
  })

  it('快速登录→退出→再登录：最终只保留最新会话', async () => {
    // 第一次登录请求尚未完成就退出
    const staleLogin = login('user', '123456')
    await logout()
    const staleResult = await staleLogin
    expect(staleResult.stale).toBe(true)
    expect(authState.isLoggedIn).toBe(false)

    // 再次登录应正常
    const fresh = await login('user', '123456')
    expect(fresh.success).toBe(true)
    expect(authState.isLoggedIn).toBe(true)

    // 受保护操作正常，且没有出现重复/旧账号数据
    const tasks = await api.getTasks()
    expect(tasks.success).toBe(true)
    tasks.data.forEach(t => {
      expect(t.title).toBeTruthy()
    })
  })

  it('令牌在页面停留期间过期：操作触发401→会话被回收→重新登录后恢复', async () => {
    await login('user', '123456')

    // 时间快进超过有效期
    mockServer.test.setClockOffset(8 * 24 * 60 * 60 * 1000)

    const result = await api.getProfile()
    expect(result.status).toBe(401)
    expect(authState.isLoggedIn).toBe(false)
    expect(authState.user).toBeNull()
    expect(localStorageMock.store[SESSION_KEY]).toBeUndefined()
    expect(events.some(e => e.type === 'session-expired')).toBe(true)

    // 时钟归位后重新登录可恢复正常
    mockServer.test.setClockOffset(0)
    const again = await login('user', '123456')
    expect(again.success).toBe(true)
    expect((await api.getProfile()).success).toBe(true)
  })

  it('损坏令牌（手动改存储）刷新后不会进入错误已登录态', async () => {
    await login('user', '123456')
    const session = JSON.parse(localStorageMock.store[SESSION_KEY])
    // 只改用户 id（令牌与资料对不上）
    session.user.id = 'U_OTHER'
    localStorageMock.store[SESSION_KEY] = JSON.stringify(session)
    __resetAuthForTests()

    await initAuth()
    expect(authState.isLoggedIn).toBe(false)
    expect(authState.user).toBeNull()
  })

  it('A账号令牌无法改动B账号任务；浏览器返回重验仍返回正确账号数据', async () => {
    await login('user', '123456')
    const aTask = (await api.getTasks()).data[0]

    // 用 B 账号令牌发起越权操作
    const b = mockServer.test.createUser({ uid: 'U_BOB', username: 'bob' })
    authState.token = mockServer.test.issueToken(b.uid)

    const attack = await api.doTaskAction({ taskId: aTask.id, action: 'cancel' })
    expect(attack.status).toBe(403)

    // 模拟浏览器返回后重验：B 令牌有效，看到的是 B 的空数据
    const valid = await revalidateSession()
    expect(valid).toBe(true)
    expect((await api.getTasks()).data).toHaveLength(0)

    // B 的资料接口也绝不会返回 A 的内容
    const profile = await api.getProfile()
    expect(profile.data.id).toBe('U_BOB')
  })

  it('未登录受保护操作拉起登录弹窗：取消中止、登录成功后放行', async () => {
    // 取消
    const cancelled = requireLogin('预约球桌')
    dismissLoginModal()
    expect(await cancelled).toBe(false)

    // 成功
    const pending = requireLogin('预约球桌')
    expect(authState.loginVisible).toBe(true)
    const result = await login('user', '123456')
    resolveLoginModal(result.user)
    expect(await pending).toBe(true)
    expect(authState.loginVisible).toBe(false)
  })
})
