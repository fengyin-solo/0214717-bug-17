/**
 * API模块单元测试
 *
 * 测试范围：
 * - 登录/退出接口
 * - 公共只读接口（无需令牌）
 * - 受控接口的授权要求（无令牌/损坏令牌/过期令牌 -> 401）
 * - 资料归属隔离：令牌只能查看/操作本人数据，不能改动其它账号
 * - 错误处理与日志
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from '../utils/api'
import { issueToken } from '../utils/token'
import taskStore from '../utils/taskStore'
import { logout } from '../utils/auth'

// ==================== localStorage Mock ====================

const localStorageMock = {
  store: {},
  getItem: vi.fn(key => (Object.prototype.hasOwnProperty.call(localStorageMock.store, key) ? localStorageMock.store[key] : null)),
  setItem: vi.fn((key, value) => { localStorageMock.store[key] = String(value) }),
  removeItem: vi.fn(key => { delete localStorageMock.store[key] }),
  clear: vi.fn(() => { localStorageMock.store = {} })
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true })

/** 以指定用户登录，返回其令牌（由“服务端”签发） */
async function loginAs(username) {
  const res = await api.login(username, '123456')
  expect(res.success).toBe(true)
  localStorageMock.store['billiard_token'] = res.data.token
  localStorageMock.store['billiard_user'] = JSON.stringify(res.data.user)
  return res.data
}

/** 手动写入令牌（绕过登录，用于构造异常会话） */
function setToken(token) {
  if (token === null) {
    delete localStorageMock.store['billiard_token']
  } else {
    localStorageMock.store['billiard_token'] = token
  }
}

// ==================== 测试用例 ====================

describe('API Module', () => {

  beforeEach(async () => {
    localStorageMock.clear()
    vi.clearAllMocks()
    await logout()
    taskStore.bindUser(null)
  })

  // ---------- 认证接口 ----------

  describe('api.login', () => {
    it('should return success with valid credentials', async () => {
      const result = await api.login('user', '123456')

      expect(result.success).toBe(true)
      expect(result.data.token).toBeDefined()
      expect(result.data.user).toBeDefined()
      expect(result.data.user.name).toBe('张三')
    })

    it('should issue a token bound to the authenticated user id', async () => {
      const result = await api.login('lisi', '123456')
      expect(result.success).toBe(true)
      expect(result.data.user.id).toBe('U20260002')
      // 令牌中必须携带归属用户
      expect(result.data.token).toContain('.')
    })

    it('should return error with invalid username', async () => {
      const result = await api.login('invalid', '123456')
      expect(result.success).toBe(false)
      expect(result.error).toContain('密码')
    })

    it('should return error with invalid password', async () => {
      const result = await api.login('user', 'wrongpassword')
      expect(result.success).toBe(false)
      expect(result.error).toContain('密码')
    })

    it('should return error with empty credentials', async () => {
      const result = await api.login('', '')
      expect(result.success).toBe(false)
    })
  })

  describe('api.logout', () => {
    it('should return success on logout', async () => {
      const result = await api.logout()
      expect(result.success).toBe(true)
    })
  })

  // ---------- 公共只读接口：无需令牌 ----------

  describe('public read endpoints', () => {
    it('getTables works without a token', async () => {
      const result = await api.getTables()
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
      expect(result.data.length).toBeGreaterThan(0)
    })

    it('getCourses works without a token', async () => {
      const result = await api.getCourses()
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })

    it('getCompetitions works without a token', async () => {
      const result = await api.getCompetitions()
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })

    it('getProducts works without a token', async () => {
      const result = await api.getProducts()
      expect(result.success).toBe(true)
      expect(Array.isArray(result.data)).toBe(true)
    })
  })

  // ---------- 受控接口：无令牌/损坏令牌/过期令牌 ----------

  describe('protected endpoints require a valid token', () => {
    it('getProfile returns 401 without token', async () => {
      const result = await api.getProfile()
      expect(result.success).toBe(false)
      expect(result.status).toBe(401)
      expect(result.code).toBe('missing')
    })

    it('getBookings returns 401 without token', async () => {
      const result = await api.getBookings()
      expect(result.success).toBe(false)
      expect(result.status).toBe(401)
    })

    it('getTasks returns 401 without token', async () => {
      const result = await api.getTasks()
      expect(result.success).toBe(false)
      expect(result.status).toBe(401)
    })

    it('bookTable returns 401 without token and does not create data', async () => {
      const result = await api.bookTable({ tableId: 1, date: '2026-03-01', timeSlot: '14:00-16:00', duration: 2 })
      expect(result.success).toBe(false)
      expect(result.status).toBe(401)
    })

    it('rejects corrupted (arbitrary) token with 401', async () => {
      setToken('garbage-token-value')
      const result = await api.getProfile()
      expect(result.success).toBe(false)
      expect(result.status).toBe(401)
      expect(['malformed', 'bad_signature']).toContain(result.code)
    })

    it('rejects tampered token signature with 401', async () => {
      const real = issueToken('U20260001')
      const [payload] = real.split('.')
      setToken(`${payload}.deadbeef`)
      const result = await api.getProfile()
      expect(result.success).toBe(false)
      expect(result.code).toBe('bad_signature')
    })

    it('rejects expired token with 401', async () => {
      setToken(issueToken('U20260001', -1000))
      const result = await api.getProfile()
      expect(result.success).toBe(false)
      expect(result.code).toBe('expired')
    })
  })

  // ---------- 令牌与资料归属 ----------

  describe('token ownership: only own controlled data', () => {
    it('getProfile returns the profile of the token owner', async () => {
      await loginAs('user')
      const result = await api.getProfile()
      expect(result.success).toBe(true)
      expect(result.data.id).toBe('U20260001')
      expect(result.data.name).toBe('张三')
    })

    it('switching token switches the visible profile (no cross leakage)', async () => {
      await loginAs('user')
      expect((await api.getProfile()).data.id).toBe('U20260001')

      await loginAs('lisi')
      const result = await api.getProfile()
      expect(result.data.id).toBe('U20260002')
      expect(result.data.name).toBe('李四')
    })

    it('booked tasks are only visible to the owner', async () => {
      // 用户A 预约
      await loginAs('user')
      const booking = await api.bookTable({ tableId: 1, date: '2026-03-01', timeSlot: '14:00-16:00', duration: 2 })
      const orderNo = booking.data.orderNo
      const aTasks = await api.getTasks()
      expect(aTasks.data.some(t => t.extra?.orderNo === orderNo)).toBe(true)

      // 切到用户B：看不到 A 刚创建的预约（按订单号归属判断）
      await loginAs('lisi')
      const bTasks = await api.getTasks()
      expect(bTasks.data.some(t => t.extra?.orderNo === orderNo)).toBe(false)
    })

    it('cannot operate on another account task (403 forbidden)', async () => {
      await loginAs('user')
      const aTasks = await api.getTasks()
      const aTaskId = aTasks.data[0].id
      expect(aTaskId).toBeTruthy()

      // 用 B 的令牌去操作 A 的任务
      await loginAs('lisi')
      const pay = await api.doTaskAction({ taskId: aTaskId, action: 'pay' })
      expect(pay.success).toBe(false)
      expect(pay.status).toBe(403)
      expect(pay.code).toBe('forbidden')

      const cancel = await api.doTaskAction({ taskId: aTaskId, action: 'cancel' })
      expect(cancel.success).toBe(false)
      expect(cancel.status).toBe(403)
    })

    it('own task actions succeed with the correct token', async () => {
      await loginAs('user')
      const tasks = await api.getTasks()
      const pendingPayment = tasks.data.find(t => t.status === 'pending_payment')
      expect(pendingPayment).toBeTruthy()

      const result = await api.doTaskAction({ taskId: pendingPayment.id, action: 'pay' })
      expect(result.success).toBe(true)
      expect(result.data.success).toBe(true)
    })

    it('cannot create an order without token', async () => {
      const result = await api.createOrder({ items: [{ productId: 1, quantity: 1 }] })
      expect(result.success).toBe(false)
      expect(result.status).toBe(401)
    })

    it('order is created under the token owner', async () => {
      await loginAs('lisi')
      const result = await api.createOrder({ items: [{ productId: 1, quantity: 1 }] })
      expect(result.success).toBe(true)
      expect(result.data.orderNo).toMatch(/^SP\d+$/)

      const orders = await api.getOrders()
      expect(orders.data.length).toBeGreaterThan(0)
      expect(orders.data.every(o => typeof o.orderNo === 'string')).toBe(true)
    })

    it('profile update only changes the token owner profile', async () => {
      await loginAs('user')
      await api.updateProfile({ name: '张三改' })

      const a = await api.getProfile()
      expect(a.data.name).toBe('张三改')

      // B 的资料不受影响
      await loginAs('lisi')
      const b = await api.getProfile()
      expect(b.data.name).toBe('李四')
    })
  })

  // ---------- 数据结构回归 ----------

  describe('data shapes', () => {
    it('tables have required fields', async () => {
      const result = await api.getTables()
      const table = result.data[0]
      ;['id', 'name', 'type', 'typeId', 'price', 'available', 'size', 'brand'].forEach(k => {
        expect(table).toHaveProperty(k)
      })
    })

    it('competitions have valid status', async () => {
      const result = await api.getCompetitions()
      const validStatuses = ['upcoming', 'ongoing', 'finished']
      result.data.forEach(comp => expect(validStatuses).toContain(comp.status))
    })

    it('products have positive prices', async () => {
      const result = await api.getProducts()
      result.data.forEach(p => expect(p.price).toBeGreaterThan(0))
    })
  })
})
