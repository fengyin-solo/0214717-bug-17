/**
 * API模块单元测试
 *
 * 覆盖范围：
 * - 登录/退出接口
 * - 公开目录接口（未登录可查看受控内容）
 * - 受保护接口：无令牌/损坏令牌/过期令牌一律 401
 * - 账号隔离：令牌只能查看/操作本账号数据
 * - 越权防护：不能改动其它账号的任务数据（403）
 * - 资料白名单与积分服务端扣减
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api, logger } from '../utils/api'
import { mockServer } from '../utils/mockServer'
import { authState, __resetAuthForTests } from '../utils/auth'

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

/** 以测试账号登录，并让后续请求携带其令牌 */
async function loginAsUser() {
  const result = await api.login('user', '123456')
  authState.token = result.data.token
  authState.user = result.data.user
  authState.isLoggedIn = true
  return result.data
}

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
  mockServer.test.resetAll()
  __resetAuthForTests()
})

// ==================== 认证接口 ====================

describe('api.login', () => {
  it('正确凭证返回令牌与用户资料', async () => {
    const result = await api.login('user', '123456')

    expect(result.success).toBe(true)
    expect(result.data.token).toBeDefined()
    expect(result.data.user.name).toBe('张三')
    expect(result.data.token.split('.')).toHaveLength(3) // 头部.负载.签名
  })

  it('错误用户名返回401', async () => {
    const result = await api.login('invalid', '123456')
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toContain('密码')
  })

  it('错误密码返回401', async () => {
    const result = await api.login('user', 'wrongpassword')
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toContain('密码')
  })

  it('空凭证返回400（参数校验）', async () => {
    const result = await api.login('', '')
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  it('登录接口自身的401不会触发全局会话回收', async () => {
    // 无全局事件监听机制断言时，至少保证登录失败不清空已有会话的副作用：
    // 先登录成功，再用错误凭证登录，已有会话不应被清掉
    await loginAsUser()
    await api.login('user', 'wrong')
    expect(authState.isLoggedIn).toBe(true)
    expect(authState.token).toBeDefined()
  })
})

describe('api.logout', () => {
  it('退出接口无需有效令牌也可调用成功', async () => {
    const result = await api.logout()
    expect(result.success).toBe(true)
  })
})

// ==================== 公开目录（受控内容，访客可查看） ====================

describe('公开目录接口', () => {
  it('未登录可以查看球桌列表', async () => {
    const result = await api.getTables()
    expect(result.success).toBe(true)
    expect(result.data.length).toBeGreaterThan(0)
    expect(result.data[0]).toHaveProperty('typeId')
  })

  it('未登录可以查看课程列表', async () => {
    const result = await api.getCourses()
    expect(result.success).toBe(true)
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data.length).toBe(4)
  })

  it('未登录可以查看赛事列表', async () => {
    const result = await api.getCompetitions()
    expect(result.success).toBe(true)
    result.data.forEach(comp => {
      expect(['upcoming', 'ongoing', 'finished']).toContain(comp.status)
    })
  })

  it('未登录可以查看商品列表', async () => {
    const result = await api.getProducts()
    expect(result.success).toBe(true)
    expect(result.data.length).toBe(8)
    result.data.forEach(product => expect(product.price).toBeGreaterThan(0))
  })
})

// ==================== 受保护接口：无/损坏/过期令牌 ====================

describe('受保护接口的令牌校验', () => {
  it('未携带令牌访问个人资料返回401', async () => {
    const result = await api.getProfile()
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toContain('登录')
  })

  it('未携带令牌访问任务列表返回401', async () => {
    const result = await api.getTasks()
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  it('损坏（篡改签名）的令牌返回401', async () => {
    await loginAsUser()
    authState.token = authState.token.slice(0, -4) + 'dead'

    const result = await api.getProfile()
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  it('结构损坏的令牌返回401', async () => {
    authState.token = 'garbage-token'
    const result = await api.getTasks()
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  it('过期令牌返回401', async () => {
    await loginAsUser()
    // 服务端时钟前进8天，超过7天有效期
    mockServer.test.setClockOffset(8 * 24 * 60 * 60 * 1000)

    const result = await api.getProfile()
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toContain('过期')
  })
})

// ==================== 账号隔离与越权防护 ====================

describe('账号数据隔离', () => {
  it('每个账号只能看到自己的任务', async () => {
    const userA = await loginAsUser()
    // userA 新登录后拥有默认演示任务
    const tasksA = await api.getTasks()
    expect(tasksA.success).toBe(true)
    expect(tasksA.data.length).toBeGreaterThan(0)
    tasksA.data.forEach(t => expect(t).toHaveProperty('id'))

    // 另一个账号（无任何任务）
    const accountB = mockServer.test.createUser({ uid: 'U_B', username: 'userb' })
    authState.token = mockServer.test.issueToken(accountB.uid)

    const tasksB = await api.getTasks()
    expect(tasksB.success).toBe(true)
    expect(tasksB.data).toHaveLength(0)

    // userA 的令牌重新放回后，数据仍然只属于 A
    authState.token = userA.token
    const tasksAgain = await api.getTasks()
    expect(tasksAgain.data.length).toBe(tasksA.data.length)
  })

  it('预约只会创建在当前令牌账号下', async () => {
    await loginAsUser()
    const table = mockServer.catalog.tables[0]

    const booking = await api.bookTable({
      table,
      date: '2026-03-01',
      time: '10:00 - 12:00',
      duration: 2
    })
    expect(booking.success).toBe(true)
    expect(booking.data.orderNo).toMatch(/^BK/)
    expect(booking.data.status).toBe('upcoming')

    const accountB = mockServer.test.createUser({ uid: 'U_B2', username: 'userb2' })
    authState.token = mockServer.test.issueToken(accountB.uid)

    const bookingsB = await api.getBookings()
    expect(bookingsB.success).toBe(true)
    expect(bookingsB.data).toHaveLength(0)
  })

  it('不能用自己的令牌操作其它账号的任务（403）', async () => {
    await loginAsUser()
    const tasksResp = await api.getTasks()
    const otherTaskId = tasksResp.data[0].id

    // 攻击者账号尝试支付/取消 user 的任务
    const attacker = mockServer.test.createUser({ uid: 'U_ATTACKER', username: 'attacker' })
    authState.token = mockServer.test.issueToken(attacker.uid)

    const pay = await api.doTaskAction({ taskId: otherTaskId, action: 'pay' })
    expect(pay.success).toBe(false)
    expect(pay.status).toBe(403)
    expect(pay.error).toContain('无权')

    const cancel = await api.doTaskAction({ taskId: otherTaskId, action: 'cancel' })
    expect(cancel.success).toBe(false)
    expect(cancel.status).toBe(403)

    // 攻击未改变任何数据：原账号任务仍在
    await loginAsUser()
    const stillThere = await api.getTasks()
    expect(stillThere.data.some(t => t.id === otherTaskId)).toBe(true)
  })

  it('操作不存在的任务返回404而不是403', async () => {
    await loginAsUser()
    const result = await api.doTaskAction({ taskId: 'T-not-exist', action: 'pay' })
    expect(result.success).toBe(false)
    expect(result.status).toBe(404)
  })

  it('本人可以支付自己的任务', async () => {
    await loginAsUser()
    const tasksResp = await api.getTasks()
    const payable = tasksResp.data.find(t => t.status === 'pending_payment')
    expect(payable).toBeDefined()

    const result = await api.doTaskAction({ taskId: payable.id, action: 'pay' })
    expect(result.success).toBe(true)

    const after = await api.getTasks()
    const updated = after.data.find(t => t.id === payable.id)
    expect(updated.status).not.toBe('pending_payment')
  })
})

// ==================== 写操作校验 ====================

describe('写操作参数与归属校验', () => {
  it('未登录不能创建预约', async () => {
    const result = await api.bookTable({
      table: mockServer.catalog.tables[0],
      date: '2026-03-01',
      time: '10:00 - 12:00',
      duration: 2
    })
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  it('预约缺少必要参数返回400', async () => {
    await loginAsUser()
    const result = await api.bookTable({ table: { id: 1 } })
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  it('未登录不能创建订单', async () => {
    const result = await api.createOrder({ items: [], amount: 0 })
    expect(result.success).toBe(false)
    expect(result.status).toBe(401)
  })

  it('登录后创建订单成功并生成订单号', async () => {
    await loginAsUser()
    const result = await api.createOrder({ amount: 2999, items: [{ id: 1, name: 'LP专业斯诺克球杆', price: 2999, qty: 1 }] })
    expect(result.success).toBe(true)
    expect(result.data.orderNo).toMatch(/^SP/)
  })

  it('空商品订单返回400', async () => {
    await loginAsUser()
    const result = await api.createOrder({ items: [] })
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  it('不能报名不存在的赛事', async () => {
    await loginAsUser()
    const result = await api.joinCompetition({ competitionId: 9999 })
    expect(result.success).toBe(false)
    expect(result.status).toBe(404)
  })

  it('报名赛事成功返回报名编号', async () => {
    await loginAsUser()
    const result = await api.joinCompetition({ competitionId: 1 })
    expect(result.success).toBe(true)
    expect(result.data.regNo).toMatch(/^REG/)
    expect(result.data.playerNo).toBeGreaterThan(0)
  })
})

// ==================== 资料与积分 ====================

describe('资料与积分的归属保护', () => {
  it('可以修改昵称/手机号/邮箱等白名单字段', async () => {
    await loginAsUser()
    const result = await api.updateProfile({ name: '李四', phone: '13900001111', email: 'lisi@example.com' })
    expect(result.success).toBe(true)
    expect(result.data.name).toBe('李四')
    expect(result.data.points).toBe(2580) // 非白名单字段不受影响
  })

  it('非法手机号被拒绝', async () => {
    await loginAsUser()
    const result = await api.updateProfile({ phone: '123' })
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  it('资料接口不允许篡改积分', async () => {
    await loginAsUser()
    await api.updateProfile({ name: '李四', points: 999999 })
    const profile = await api.getProfile()
    expect(profile.data.points).toBe(2580)
    expect(profile.data.name).toBe('李四')
  })

  it('积分兑换由服务端校验余额并扣减', async () => {
    await loginAsUser()
    const result = await api.exchangePoints({ points: 200 })
    expect(result.success).toBe(true)
    expect(result.data.points).toBe(2380)

    const profile = await api.getProfile()
    expect(profile.data.points).toBe(2380)
  })

  it('积分余额不足时拒绝兑换', async () => {
    await loginAsUser()
    const result = await api.exchangePoints({ points: 999999 })
    expect(result.success).toBe(false)
    expect(result.status).toBe(400)
  })

  it('未登录不能读取或修改资料', async () => {
    expect((await api.getProfile()).status).toBe(401)
    expect((await api.updateProfile({ name: '黑客' })).status).toBe(401)
    expect((await api.exchangePoints({ points: 1 })).status).toBe(401)
  })
})

// ==================== 日志记录器 ====================

describe('Logger', () => {
  it('具备全部日志方法且调用不抛错', () => {
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.debug).toBe('function')
    expect(() => logger.info('test message')).not.toThrow()
    expect(() => logger.error('test error', new Error('test'))).not.toThrow()
  })
})
