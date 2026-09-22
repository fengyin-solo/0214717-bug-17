/**
 * API 接口层
 *
 * 功能说明：
 * - 封装所有后端API请求
 * - 支持模拟数据模式和真实API模式
 * - 每次请求自动携带当前会话令牌
 * - 令牌损坏/过期（401）时统一通知认证层失效处理
 *
 * 使用方式：
 * import { api, logger } from '@/utils/api'
 * const result = await api.login('user', '123456')
 *
 * 权限模型：
 * - 公开接口（目录浏览、登录）无需令牌
 * - 受保护接口必须携带有效令牌，服务端只返回该令牌所属账号的数据
 * - 写操作在服务端二次校验资源归属，禁止改动其它账号数据
 */

import { mockServer } from './mockServer'
import { authState, handleUnauthorized } from './auth'

// API基础地址，从环境变量读取
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

// 日志级别配置
const LOG_LEVEL = import.meta.env.VITE_LOG_LEVEL || 'info'
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 }

/**
 * 模拟网络延迟
 * 测试环境下不等待，保证用例快速执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise} 延迟Promise
 */
const delay = (ms) => {
  if (import.meta.env.MODE === 'test') return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 日志记录器
 * 根据配置的日志级别输出不同级别的日志
 */
export const logger = {
  /**
   * 检查是否应该输出该级别的日志
   * @param {string} level - 日志级别
   * @returns {boolean} 是否输出
   */
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

/**
 * 统一请求封装
 *
 * @param {string} url - 请求路径（不含基础URL）
 * @param {Object} options - 请求配置
 * @param {string} options.method - 请求方法 GET/POST/PUT/DELETE
 * @param {Object} options.body - 请求体（会自动JSON序列化）
 * @param {Object} options.headers - 额外的请求头
 * @param {Object} options.params - 查询参数（模拟模式使用）
 * @param {boolean} [options.skipAuth=false] - 跳过401全局处理（登录接口使用）
 * @returns {Promise<{success: boolean, status?: number, data?: any, error?: string}>}
 */
async function request(url, options = {}) {
  logger.info(`API Request: ${options.method || 'GET'} ${url}`)

  // 模拟模式：由本地模拟服务端处理（含令牌校验与账号隔离）
  if (import.meta.env.VITE_USE_MOCK !== 'false') {
    await delay(300 + Math.random() * 300)

    const response = mockServer.dispatch(url, {
      method: options.method || 'GET',
      body: options.rawBody,
      params: options.params,
      token: authState.token
    })

    if (response.ok) {
      logger.info(`API Response: ${url}`, { status: response.status })
      return { success: true, status: response.status, data: response.data }
    }

    logger.warn(`API Response: ${url}`, { status: response.status, error: response.error })
    if (response.status === 401 && !options.skipAuth) {
      handleUnauthorized(response.error)
    }
    return { success: false, status: response.status, error: response.error }
  }

  // 真实API调用
  try {
    const response = await fetch(`${API_BASE_URL}${url}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authState.token ? { Authorization: `Bearer ${authState.token}` } : {}),
        ...options.headers
      },
      ...(options.rawBody !== undefined ? { body: options.rawBody } : {})
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const message = errorData.error || `HTTP ${response.status}: ${response.statusText}`
      if (response.status === 401 && !options.skipAuth) {
        handleUnauthorized(message)
      }
      return { success: false, status: response.status, error: message }
    }

    const data = await response.json().catch(() => null)
    logger.info(`API Response: ${url}`, { status: 'success' })
    return { success: true, status: response.status, data }
  } catch (error) {
    logger.error(`API Error: ${url}`, error)
    return {
      success: false,
      status: 0,
      error: error.message || '网络请求失败，请稍后重试'
    }
  }
}

// ==================== 导出API方法 ====================

/**
 * API接口集合
 * 按业务模块组织，提供统一的调用入口
 */
export const api = {
  // ========== 认证模块 ==========

  /**
   * 用户登录
   * @param {string} username - 用户名
   * @param {string} password - 密码
   * @returns {Promise<{success: boolean, data?: {token: string, user: Object}}>}
   */
  login: (username, password) => request('/auth/login', {
    method: 'POST',
    rawBody: JSON.stringify({ username, password }),
    skipAuth: true
  }),

  /**
   * 用户退出登录
   */
  logout: () => request('/auth/logout', { method: 'POST' }),

  /**
   * 拉取当前令牌对应的账号资料（用于会话恢复时与服务端对账）
   */
  getMe: () => request('/auth/me'),

  // ========== 球桌模块 ==========

  /**
   * 获取球桌列表（公开内容）
   */
  getTables: (params) => request('/tables', { params }),

  /**
   * 创建球桌预约（受保护，归属当前令牌账号）
   * @param {Object} data
   * @param {Object} data.table - 球桌完整信息
   * @param {string} data.date - 预约日期
   * @param {string} data.time - 时段
   * @param {number} data.duration - 时长（小时）
   */
  bookTable: (data) => request('/bookings', {
    method: 'POST',
    rawBody: JSON.stringify(data)
  }),

  // ========== 课程模块 ==========

  /**
   * 获取课程列表（公开内容）
   */
  getCourses: () => request('/courses'),

  /**
   * 报名课程（受保护，归属当前令牌账号）
   * @param {Object} data
   * @param {Object} data.course - 课程完整信息
   */
  enrollCourse: (data) => request('/courses/enroll', {
    method: 'POST',
    rawBody: JSON.stringify(data)
  }),

  // ========== 赛事模块 ==========

  /**
   * 获取赛事列表（公开内容）
   */
  getCompetitions: (params) => request('/competitions', { params }),

  /**
   * 报名参赛（受保护，归属当前令牌账号）
   * @param {Object} data
   * @param {number} data.competitionId - 赛事ID
   */
  joinCompetition: (data) => request('/competitions/join', {
    method: 'POST',
    rawBody: JSON.stringify(data)
  }),

  // ========== 商品模块 ==========

  /**
   * 获取商品列表（公开内容）
   */
  getProducts: (params) => request('/products', { params }),

  /**
   * 创建商品订单（受保护，归属当前令牌账号）
   * @param {Object} data - { amount, items }
   */
  createOrder: (data) => request('/orders', {
    method: 'POST',
    rawBody: JSON.stringify(data)
  }),

  // ========== 用户模块 ==========

  /**
   * 获取当前账号资料（受保护）
   */
  getProfile: () => request('/user/profile'),

  /**
   * 更新当前账号资料（受保护，仅允许昵称/手机号/邮箱等白名单字段）
   */
  updateProfile: (data) => request('/user/profile', {
    method: 'PUT',
    rawBody: JSON.stringify(data)
  }),

  /**
   * 积分兑换（受保护，服务端校验余额并扣减）
   */
  exchangePoints: (data) => request('/user/points/exchange', {
    method: 'POST',
    rawBody: JSON.stringify(data)
  }),

  /**
   * 获取当前账号的预约记录（受保护）
   */
  getBookings: () => request('/bookings'),

  // ========== 任务中心模块 ==========

  /**
   * 获取当前账号的任务列表（受保护）
   * @param {Object} params
   * @param {string} params.status - pending(待处理)/completed(已完成)
   */
  getTasks: (params) => request('/user/tasks', { params }),

  /**
   * 执行任务操作（受保护，服务端校验任务归属，禁止操作他人任务）
   * @param {Object} data
   * @param {string} data.taskId - 任务ID
   * @param {string} data.action - pay/cancel/view/remind/rebook/rebuy/confirm/review
   */
  doTaskAction: (data) => request('/user/tasks', {
    method: 'POST',
    rawBody: JSON.stringify(data)
  })
}

export default api
