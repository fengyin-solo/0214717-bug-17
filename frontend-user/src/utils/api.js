/**
 * API 接口层
 *
 * 功能说明：
 * - 封装所有后端API请求
 * - 支持模拟数据模式和真实API模式
 * - 统一的错误处理、日志记录与 401 会话失效处理
 *
 * 授权模型（两种模式一致）：
 * - 公共只读接口（球桌/课程/赛事/商品、登录登出）：无需令牌
 * - 受控接口（个人资料、预约、订单、任务）：必须携带有效令牌
 * - 受控数据全部按令牌中的 userId 隔离：只能查看自己的受控内容，
 *   不能读写其它账号的数据；令牌损坏/过期一律 401
 *
 * 切换模式：
 * - 设置 VITE_USE_MOCK=true 使用模拟数据
 * - 设置 VITE_USE_MOCK=false 调用真实API
 */

import { issueToken, verifyToken, AUTH_TOKEN_KEY } from './token'
import { loadProfile, saveProfile } from './accountStore'
import { taskStore as ts } from './taskStore'

// API基础地址，从环境变量读取
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// 日志级别配置
const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || 'info'
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

// 任务存储（用于任务中心数据持久化）
const taskStore = ts

/** 401 会话失效回调（由 auth.js 注入，避免循环依赖） */
let onUnauthorizedHandler = null
export function setUnauthorizedHandler(handler) {
  onUnauthorizedHandler = handler
}

function notifyUnauthorized(reason = 'unauthorized') {
  if (typeof onUnauthorizedHandler === 'function') {
    onUnauthorizedHandler(reason)
  }
}

/**
 * 模拟网络延迟
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise} 延迟Promise
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 日志记录器
 */
export const logger = {
  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[LOG_LEVEL]
  },

  format(level, message) {
    return `[${level.toUpperCase()}] ${new Date().toISOString()} - ${message}`
  },

  debug(message, data) {
    if (this.shouldLog('debug')) {
      console.debug(this.format('debug', message), data || '')
    }
  },

  info(message, data) {
    if (this.shouldLog('info')) {
      console.log(this.format('info', message), data || '')
    }
  },

  warn(message, data) {
    if (this.shouldLog('warn')) {
      console.warn(this.format('warn', message), data || '')
    }
  },

  error(message, error) {
    if (this.shouldLog('error')) {
      console.error(this.format('error', message), error || '')
    }
  }
}

// ==================== 统一请求封装 ====================

/**
 * 统一请求封装
 * @param {string} url - 请求路径（不含基础URL）
 * @param {Object} options - 请求配置
 * @returns {Promise<{success: boolean, data?: any, error?: string, status?: number, code?: string}>}
 */
async function request(url, options = {}) {
  const fullUrl = `${API_BASE_URL}${url}`
  logger.info(`API Request: ${options.method || 'GET'} ${fullUrl}`)

  try {
    // 模拟模式：使用前端模拟数据
    if (import.meta.env.VITE_USE_MOCK !== 'false') {
      logger.debug('Using mock data mode')
      return await mockRequest(url, options)
    }

    // 真实API调用：始终携带当前令牌（无令牌时由后端拒绝受控接口）
    const token = options.token || safeGetToken()
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }

    const response = await fetch(fullUrl, {
      ...options,
      headers
    })

    // 401/403：令牌失效、过期或越权 —— 清理本地会话
    if (response.status === 401 || response.status === 403) {
      const errorData = await response.json().catch(() => ({}))
      logger.warn(`API unauthorized: ${url}`, { status: response.status })
      notifyUnauthorized(errorData.code || (response.status === 403 ? 'forbidden' : 'unauthorized'))
      return {
        success: false,
        status: response.status,
        code: errorData.code || 'UNAUTHORIZED',
        error: errorData.error || '登录已失效，请重新登录'
      }
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    logger.info(`API Response: ${url}`, { status: 'success' })
    return { success: true, data }
  } catch (error) {
    logger.error(`API Error: ${url}`, error)
    return {
      success: false,
      error: error.message || '网络请求失败，请稍后重试'
    }
  }
}

function safeGetToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch (e) {
    return null
  }
}

/**
 * 从请求配置中解析 Bearer 令牌
 * @param {Object} options
 * @returns {string|null}
 */
function extractToken(options = {}) {
  if (options.token) return options.token
  const auth = options.headers?.Authorization || options.headers?.authorization
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7)
  return safeGetToken()
}

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

/** 要求已登录，返回令牌归属 userId；否则抛 401 */
function requireUser(options) {
  const token = extractToken(options)
  const check = verifyToken(token)
  if (!check.valid) {
    throw new HttpError(401, check.reason || 'unauthorized', AUTH_ERROR_MESSAGE[check.reason] || '未登录或登录已失效')
  }
  return check.userId
}

const AUTH_ERROR_MESSAGE = {
  missing: '请先登录',
  malformed: '登录凭证已损坏，请重新登录',
  bad_signature: '登录凭证无效，请重新登录',
  expired: '登录已过期，请重新登录'
}

// ==================== 模拟请求处理器 ====================

/**
 * 模拟请求处理器
 */
async function mockRequest(url, options) {
  // 模拟网络延迟 100-400ms（降低测试与快速操作的等待时间）
  await delay(100 + Math.random() * 300)

  try {
    // 公共接口：无需令牌
    const publicRoutes = {
      'POST /auth/login': () => handleLogin(options),
      'POST /auth/logout': handleLogout,
      'GET /tables': () => mockData.tables,
      'GET /courses': () => mockCourses,
      'GET /competitions': () => mockCompetitions,
      'GET /products': () => mockProducts
    }

    // 受控只读接口：有效令牌，且只能读取本人数据
    const authedReadRoutes = {
      'GET /user/profile': (userId) => handleGetProfile(userId),
      'GET /bookings': (userId) => handleGetBookings(userId),
      'GET /orders': (userId) => handleGetOrders(userId),
      'GET /user/tasks': (userId) => handleGetTasks(userId, options)
    }

    // 受控写入接口：有效令牌 + 归属校验
    const authedWriteRoutes = {
      'POST /bookings': (userId) => handleCreateBooking(userId, options),
      'POST /courses/enroll': (userId) => handleEnrollCourse(userId, options),
      'POST /competitions/join': (userId) => handleJoinCompetition(userId, options),
      'POST /orders': (userId) => handleCreateOrder(userId, options),
      'PUT /user/profile': (userId) => handleUpdateProfile(userId, options),
      'POST /user/tasks': (userId) => handleTaskAction(userId, options)
    }

    const method = options.method || 'GET'
    const routeKey = `${method} ${url}`

    let userId = null
    if (authedReadRoutes[routeKey] || authedWriteRoutes[routeKey]) {
      userId = requireUser(options)
    }

    const handler =
      publicRoutes[routeKey] ||
      authedReadRoutes[routeKey] ||
      authedWriteRoutes[routeKey]

    if (handler) {
      const data = await handler(userId)
      return { success: true, data }
    }

    return { success: false, status: 404, code: 'not_found', error: `API not found: ${url}` }
  } catch (error) {
    if (error instanceof HttpError) {
      logger.warn(`Mock unauthorized: ${url}`, { reason: error.code })
      // 持有的令牌损坏/过期：通知会话层清理，页面不会停留在错误登录态
      notifyUnauthorized(error.code)
      return { success: false, status: error.status, code: error.code, error: error.message }
    }
    return { success: false, error: error.message }
  }
}

// ==================== 模拟数据处理函数 ====================

/**
 * 处理登录请求
 * 验证用户名密码，返回服务端签发的令牌与用户信息
 */
function handleLogin(options) {
  const body = safeParseBody(options.body)
  const { username, password } = body

  const account = mockAccounts.find(a => a.username === username)
  if (!account || account.password !== password) {
    logger.warn('Mock login failed', { username })
    throw new Error('用户名或密码错误')
  }

  // 令牌由“服务端”签发，归属该用户
  const token = issueToken(account.userId)
  const user = buildUserView(account.userId)
  logger.info('Mock login successful', { username, userId: account.userId })
  return { token, user }
}

/**
 * 处理退出登录请求（本地清理由 auth 层负责，此接口不强制令牌）
 */
function handleLogout() {
  logger.info('Mock logout')
  return { message: '退出成功' }
}

/**
 * 获取本人资料（合并本地编辑结果）
 */
function handleGetProfile(userId) {
  return buildUserView(userId)
}

/**
 * 更新本人资料：仅允许白名单字段，且只作用于令牌归属账号
 */
function handleUpdateProfile(userId, options) {
  const body = safeParseBody(options.body)
  const allowed = ['name', 'phone', 'email']
  const updates = {}
  allowed.forEach(key => {
    if (typeof body[key] === 'string') updates[key] = body[key].trim()
  })

  // 合并到本地资料存储
  const base = buildUserView(userId)
  const merged = saveProfile(userId, { ...base, ...updates })
  logger.info('Mock profile updated', { userId, fields: Object.keys(updates) })
  return { ...base, ...merged }
}

/**
 * 获取本人预约（仅返回归属本人的任务）
 */
function handleGetBookings(userId) {
  return taskStore
    .getAll(userId)
    .filter(t => t.type === 'booking')
    .map(t => ({
      id: t.id,
      orderNo: t.extra?.orderNo || t.id,
      tableName: t.title,
      date: t.extra?.date || '',
      time: t.extra?.time || '',
      status: t.status === 'pending_payment' ? 'upcoming' : t.status
    }))
}

/**
 * 获取本人订单
 */
function handleGetOrders(userId) {
  return taskStore
    .getAll(userId)
    .filter(t => t.type === 'order')
    .map(t => ({
      id: t.id,
      orderNo: t.extra?.orderNo || t.id,
      items: t.extra?.items || [],
      amount: t.amount,
      status: t.status
    }))
}

/**
 * 创建预约：归属到令牌用户
 */
function handleCreateBooking(userId, options) {
  const body = safeParseBody(options.body)
  const table = mockData.tables.find(t => t.id === Number(body.tableId))
  if (!table) {
    throw new Error('球桌不存在')
  }
  const orderNo = 'BK' + Date.now().toString().slice(-8)
  const bookingInfo = {
    orderNo,
    date: body.date,
    time: body.timeSlot || body.time,
    duration: Number(body.duration) || 1
  }
  taskStore.addBookingTask(table, bookingInfo, userId)
  logger.info('Mock booking created', { orderNo, userId })
  return { orderNo, ...body, status: 'upcoming' }
}

/**
 * 课程报名
 */
function handleEnrollCourse(userId, options) {
  const body = safeParseBody(options.body)
  const course = mockCourses.find(c => c.id === Number(body.courseId))
  if (!course) {
    throw new Error('课程不存在')
  }
  const orderNo = 'CR' + Date.now().toString().slice(-8)
  taskStore.addCourseTask(course, { orderNo }, userId)
  logger.info('Mock course enrolled', { orderNo, userId })
  return {
    orderNo,
    courseId: course.id,
    courseName: course.name,
    status: 'enrolled'
  }
}

/**
 * 赛事报名
 */
function handleJoinCompetition(userId, options) {
  const body = safeParseBody(options.body)
  const competition = mockCompetitions.find(c => c.id === Number(body.competitionId))
  if (!competition) {
    throw new Error('赛事不存在')
  }
  if (competition.participants >= competition.maxParticipants) {
    throw new Error('报名人数已满')
  }
  const regNo = 'REG' + Date.now().toString().slice(-8)
  const playerNo = Math.floor(Math.random() * 100) + 1
  taskStore.addCompetitionTask(competition, { regNo, playerNo }, userId)
  logger.info('Mock competition joined', { regNo, userId })
  return { regNo, playerNo, status: 'registered' }
}

/**
 * 创建商品订单
 */
function handleCreateOrder(userId, options) {
  const body = safeParseBody(options.body)
  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) {
    throw new Error('订单商品不能为空')
  }
  const orderNo = 'SP' + Date.now().toString().slice(-8)
  const enrichedItems = items.map(item => {
    const product = mockProducts.find(p => p.id === Number(item.productId || item.id))
    return {
      productId: item.productId || item.id,
      name: product?.name || `商品${item.productId || item.id}`,
      price: product?.price ?? item.price ?? 0,
      quantity: item.quantity || 1
    }
  })
  const amount = enrichedItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const order = {
    orderNo,
    amount,
    items: enrichedItems,
    createTime: new Date().toLocaleString()
  }
  taskStore.addOrderTask(order, userId)
  logger.info('Mock order created', { orderNo, userId })
  return { ...order, status: 'paid' }
}

/**
 * 查询本人任务
 */
function handleGetTasks(userId, options) {
  const params = options.params || {}
  if (params.status) {
    return taskStore.getByStatus(params.status, userId)
  }
  return taskStore.getAll(userId)
}

/**
 * 任务操作：支付、取消等。
 * 只能操作归属本人的任务 —— getById 在他人空间找不到即视为失败。
 */
function handleTaskAction(userId, options) {
  const body = safeParseBody(options.body)
  const { taskId, action } = body

  // 归属校验：先确认任务存在于当前用户空间
  const owned = taskStore.getById(taskId, userId)
  if (!owned) {
    logger.warn('Task action denied: not owned or not found', { taskId, userId })
    throw new HttpError(403, 'forbidden', '不能操作他人的任务或任务不存在')
  }

  logger.info('Task action via API', { taskId, action, userId })

  if (action === 'pay') {
    const result = taskStore.markAsPaid(taskId, userId)
    return { success: !!result, message: result ? '支付成功' : '支付失败' }
  }
  if (action === 'cancel') {
    const result = taskStore.remove(taskId, userId)
    return { success: result, message: result ? '取消成功' : '取消失败' }
  }
  if (action === 'confirm') {
    const result = taskStore.updateStatus(taskId, 'completed', userId)
    return { success: !!result, message: result ? '操作成功' : '操作失败' }
  }

  return { success: true, message: '操作成功' }
}

function safeParseBody(body) {
  try {
    return JSON.parse(body || '{}')
  } catch (e) {
    return {}
  }
}

// ==================== 模拟账号与数据 ====================

/**
 * 模拟账号库（生产环境由后端数据库提供）
 * 密码仅用于 Mock 演示
 */
const mockAccounts = [
  { userId: 'U20260001', username: 'user', password: '123456' },
  { userId: 'U20260002', username: 'lisi', password: '123456' }
]

/**
 * 组装某用户的资料视图：基础资料 + 本地编辑结果
 */
function buildUserView(userId) {
  const base = baseUserProfiles[userId]
  if (!base) {
    // 未知用户不应到达这里（登录已拦截），防御性返回
    throw new HttpError(401, 'unauthorized', '用户不存在')
  }
  return { ...base, ...loadProfile(userId) }
}

const baseUserProfiles = {
  U20260001: {
    id: 'U20260001',
    name: '张三',
    level: '黄金',
    points: 2580,
    totalHours: 156,
    competitions: 12,
    wins: 8,
    courses: 3,
    phone: '138****8888',
    email: 'zhang***@email.com'
  },
  U20260002: {
    id: 'U20260002',
    name: '李四',
    level: '白银',
    points: 680,
    totalHours: 42,
    competitions: 3,
    wins: 1,
    courses: 1,
    phone: '139****6666',
    email: 'lisi***@email.com'
  }
}

/**
 * 模拟数据集合（公共内容，登录与否均可浏览）
 */
const mockData = {
  // 球桌列表
  tables: [
    { id: 1, name: '1号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: true, size: '12尺', brand: '星牌' },
    { id: 2, name: '2号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: false, size: '12尺', brand: '星牌' },
    { id: 3, name: '3号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
    { id: 4, name: '4号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
    { id: 5, name: '5号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: false, size: '9尺', brand: '乔氏' },
    { id: 6, name: '6号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: true, size: '9尺', brand: '乔氏' }
  ]
}

const mockCourses = [
  { id: 1, name: '台球入门基础课', icon: '🎯', level: '入门', duration: '4周', lessons: '8课时', students: 156, price: 599, originalPrice: 799, description: '从零开始学习台球', coach: '张明', coachTitle: '高级教练', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 2, name: '斯诺克进阶训练', icon: '🎱', level: '进阶', duration: '6周', lessons: '12课时', students: 89, price: 1299, originalPrice: 1599, description: '深入学习斯诺克战术', coach: '李强', coachTitle: '国家级教练', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }
]

const mockCompetitions = [
  { id: 1, name: '2026春季斯诺克公开赛', type: '斯诺克', date: '2026-03-15', location: '主馆A区', prize: 50000, fee: 200, participants: 28, maxParticipants: 32, status: 'upcoming' },
  { id: 2, name: '周末九球挑战赛', type: '美式九球', date: '2026-02-14', location: '主馆B区', prize: 10000, fee: 100, participants: 16, maxParticipants: 16, status: 'ongoing' }
]

const mockProducts = [
  { id: 1, name: 'LP专业斯诺克球杆', brand: 'LP', price: 2999, originalPrice: 3599, category: 'cue', icon: '🏏', description: '进口白蜡木杆身', sales: 328, hot: true },
  { id: 2, name: '星牌比赛用球', brand: '星牌', price: 1299, originalPrice: 1499, category: 'ball', icon: '🎱', description: '国际比赛标准', sales: 892, hot: true }
]

// ==================== 导出API方法 ====================

/**
 * API接口集合
 */
export const api = {
  // ========== 认证模块 ==========

  login: (username, password) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  }),

  logout: () => request('/auth/logout', { method: 'POST' }),

  // ========== 球桌模块 ==========

  getTables: (params) => request('/tables', { params }),

  bookTable: (data) => request('/bookings', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // ========== 课程模块 ==========

  getCourses: () => request('/courses'),

  enrollCourse: (data) => request('/courses/enroll', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // ========== 赛事模块 ==========

  getCompetitions: (params) => request('/competitions', { params }),

  joinCompetition: (data) => request('/competitions/join', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // ========== 商品模块 ==========

  getProducts: (params) => request('/products', { params }),

  createOrder: (data) => request('/orders', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // ========== 用户模块 ==========

  getProfile: () => request('/user/profile'),

  updateProfile: (data) => request('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(data)
  }),

  getBookings: () => request('/bookings'),

  /**
   * 获取本人商品订单
   */
  getOrders: () => request('/orders'),

  // ========== 任务中心模块 ==========

  getTasks: (params) => request('/user/tasks', { params }),

  doTaskAction: (data) => request('/user/tasks', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export default api
