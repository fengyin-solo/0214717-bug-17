/**
 * 任务中心存储管理
 * 统一管理预约、报名、订单等任务数据，使用 localStorage 持久化
 *
 * 归属隔离：
 * - 存储键按用户ID隔离（billiard_user_tasks_<userId>）
 * - 所有读写必须先绑定当前用户（bindUser），或显式传入 userId
 * - 未绑定用户时拒绝读写，避免游客/串号会话看到或改动他人数据
 * - 退出登录时调用 clearUserData 清除该账号的本地任务
 */

const STORAGE_KEY_PREFIX = 'billiard_user_tasks_'

/** 当前绑定的用户ID（由 auth 在登录/恢复会话时设置） */
let currentUserId = null

const logger = {
  info: (...args) => console.log('[taskStore]', ...args),
  warn: (...args) => console.warn('[taskStore]', ...args),
  error: (...args) => console.error('[taskStore]', ...args)
}

const taskTypeConfig = {
  booking: {
    name: '球桌预约',
    icon: '🎱',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary', route: '/tables' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看详情', type: 'primary' },
        { key: 'rebook', label: '再次预约', type: 'default', route: '/tables' }
      ],
      ongoing: [
        { key: 'view', label: '查看详情', type: 'primary' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default' },
        { key: 'rebook', label: '再次预约', type: 'primary', route: '/tables' }
      ]
    }
  },
  course: {
    name: '课程报名',
    icon: '📚',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary', route: '/courses' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看详情', type: 'primary', route: '/courses' }
      ],
      ongoing: [
        { key: 'view', label: '继续学习', type: 'primary', route: '/courses' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default' },
        { key: 'review', label: '评价', type: 'primary' }
      ]
    }
  },
  competition: {
    name: '赛事报名',
    icon: '🏆',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary', route: '/competitions' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      upcoming: [
        { key: 'view', label: '查看赛程', type: 'primary', route: '/competitions' }
      ],
      ongoing: [
        { key: 'view', label: '观看直播', type: 'primary', route: '/competitions' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default', route: '/competitions' }
      ]
    }
  },
  order: {
    name: '商城订单',
    icon: '🛒',
    actions: {
      pending_payment: [
        { key: 'pay', label: '继续付款', type: 'primary', route: '/shop' },
        { key: 'cancel', label: '取消', type: 'danger' }
      ],
      pending_shipment: [
        { key: 'view', label: '查看订单', type: 'primary', route: '/shop' },
        { key: 'remind', label: '提醒发货', type: 'default' }
      ],
      shipped: [
        { key: 'view', label: '查看物流', type: 'primary', route: '/shop' },
        { key: 'confirm', label: '确认收货', type: 'primary' }
      ],
      completed: [
        { key: 'view', label: '查看结果', type: 'default', route: '/shop' },
        { key: 'review', label: '评价', type: 'primary' },
        { key: 'rebuy', label: '再次购买', type: 'default', route: '/shop' }
      ]
    }
  }
}

const statusConfig = {
  pending_payment: { text: '待付款', type: 'warning' },
  upcoming: { text: '待开始', type: 'info' },
  ongoing: { text: '进行中', type: 'primary' },
  pending_shipment: { text: '待发货', type: 'warning' },
  shipped: { text: '已发货', type: 'info' },
  completed: { text: '已完成', type: 'success' },
  cancelled: { text: '已取消', type: 'success' }
}

/** 旧版本未按用户隔离的全局存储键，用于一次性清理历史残留数据 */
const LEGACY_STORAGE_KEY = 'billiard_user_tasks'

/**
 * 获取指定用户的存储键
 * @param {string} userId
 * @returns {string}
 */
function storageKeyFor(userId) {
  return `${STORAGE_KEY_PREFIX}${userId}`
}

/**
 * 绑定当前登录用户（由 auth 模块调用）
 * @param {string|null} userId
 */
function bindUser(userId) {
  currentUserId = userId || null
}

/**
 * 解析本次操作使用的用户ID：显式传入优先，否则用当前绑定用户
 * @param {string} [userId]
 * @returns {string|null}
 */
function resolveUserId(userId) {
  return userId || currentUserId
}

function loadTasks(userId) {
  const ownerId = resolveUserId(userId)
  if (!ownerId) {
    logger.warn('未绑定用户，拒绝读取任务')
    return []
  }
  const key = storageKeyFor(ownerId)
  try {
    const stored = localStorage.getItem(key)
    if (stored) {
      const parsed = JSON.parse(stored)
      // 仅接受归属于该用户的数据结构
      if (parsed && parsed.userId === ownerId && Array.isArray(parsed.tasks)) {
        return parsed.tasks
      }
      logger.warn('任务数据归属不匹配或结构损坏，已忽略', { ownerId })
      return []
    }
    // 首次访问：为该用户初始化演示任务
    const defaults = getDefaultTasks()
    saveTasks(defaults, ownerId)
    return defaults
  } catch (e) {
    logger.error('加载任务失败', e)
    return []
  }
}

function saveTasks(tasks, userId) {
  const ownerId = resolveUserId(userId)
  if (!ownerId) {
    logger.warn('未绑定用户，拒绝保存任务')
    return false
  }
  try {
    localStorage.setItem(
      storageKeyFor(ownerId),
      JSON.stringify({ userId: ownerId, tasks })
    )
    return true
  } catch (e) {
    logger.error('保存任务失败', e)
    return false
  }
}

function getDefaultTasks() {
  return [
    {
      id: 'T' + Date.now().toString() + '001',
      type: 'booking',
      title: '3号球桌 - 美式九球',
      subtitle: '2026-02-15 14:00 - 16:00',
      amount: 120,
      status: 'pending_payment',
      createdAt: formatDate(new Date(Date.now() - 86400000)),
      extra: { tableId: 3, date: '2026-02-15', time: '14:00 - 16:00' }
    },
    {
      id: 'T' + Date.now().toString() + '002',
      type: 'course',
      title: '台球入门基础课',
      subtitle: '报名成功，等待开课',
      amount: 599,
      status: 'upcoming',
      createdAt: formatDate(new Date(Date.now() - 259200000)),
      extra: { courseId: 1 }
    },
    {
      id: 'T' + Date.now().toString() + '003',
      type: 'competition',
      title: '周末九球挑战赛',
      subtitle: '比赛进行中',
      amount: 100,
      status: 'ongoing',
      createdAt: formatDate(new Date(Date.now() - 432000000)),
      extra: { competitionId: 2 }
    },
    {
      id: 'T' + Date.now().toString() + '004',
      type: 'order',
      title: 'LP专业斯诺克球杆',
      subtitle: '待发货',
      amount: 2999,
      status: 'pending_shipment',
      createdAt: formatDate(new Date(Date.now() - 172800000)),
      extra: { orderNo: 'SP' + Date.now().toString().slice(-8), productId: 1 }
    }
  ]
}

function formatDate(date) {
  const d = new Date(date)
  const pad = n => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function generateTaskId() {
  return 'T' + Date.now().toString() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
}

function enrichTask(task) {
  const typeInfo = taskTypeConfig[task.type]
  const statusInfo = statusConfig[task.status]
  const actions = typeInfo?.actions?.[task.status] || []

  return {
    ...task,
    typeName: typeInfo?.name || task.type,
    typeIcon: typeInfo?.icon || '📋',
    statusText: statusInfo?.text || task.status,
    statusType: statusInfo?.type || 'info',
    actions: actions
  }
}

export const taskStore = {
  /** 当前绑定的用户ID */
  get currentUserId() {
    return currentUserId
  },

  bindUser,

  /**
   * 清除指定用户（默认当前用户）的全部本地任务
   * 同时清理旧版本的全局任务数据
   * @param {string} [userId]
   */
  clearUserData(userId) {
    const ownerId = resolveUserId(userId)
    try {
      if (ownerId) {
        localStorage.removeItem(storageKeyFor(ownerId))
      }
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch (e) {
      logger.error('清除任务数据失败', e)
    }
    if (!ownerId || ownerId === currentUserId) {
      currentUserId = null
    }
    logger.info('用户任务数据已清除', { ownerId })
  },

  getAll(userId) {
    const tasks = loadTasks(userId)
    return tasks.map(enrichTask).sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  },

  getByStatus(status, userId) {
    const tasks = this.getAll(userId)
    if (status === 'pending') {
      return tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    }
    if (status === 'completed') {
      return tasks.filter(t => t.status === 'completed')
    }
    return tasks
  },

  getById(taskId, userId) {
    const tasks = loadTasks(userId)
    const task = tasks.find(t => t.id === taskId)
    return task ? enrichTask(task) : null
  },

  add(taskData, userId) {
    const tasks = loadTasks(userId)
    const newTask = {
      id: generateTaskId(),
      createdAt: formatDate(new Date()),
      ...taskData
    }
    tasks.unshift(newTask)
    saveTasks(tasks, userId)
    logger.info('任务已添加', newTask)
    return enrichTask(newTask)
  },

  update(taskId, updates, userId) {
    const tasks = loadTasks(userId)
    const index = tasks.findIndex(t => t.id === taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    tasks[index] = { ...tasks[index], ...updates }
    saveTasks(tasks, userId)
    logger.info('任务已更新', taskId, updates)
    return enrichTask(tasks[index])
  },

  updateStatus(taskId, newStatus, userId) {
    const statusInfo = statusConfig[newStatus]
    if (!statusInfo) {
      logger.error('无效的状态', newStatus)
      return null
    }
    return this.update(taskId, { status: newStatus }, userId)
  },

  remove(taskId, userId) {
    const tasks = loadTasks(userId)
    const filtered = tasks.filter(t => t.id !== taskId)
    if (filtered.length === tasks.length) {
      logger.warn('任务不存在，无法删除', taskId)
      return false
    }
    saveTasks(filtered, userId)
    logger.info('任务已删除', taskId)
    return true
  },

  addBookingTask(table, bookingInfo, userId) {
    return this.add({
      type: 'booking',
      title: `${table.name} - ${table.type}`,
      subtitle: `${bookingInfo.date} ${bookingInfo.time}`,
      amount: table.price * bookingInfo.duration,
      status: 'pending_payment',
      extra: {
        tableId: table.id,
        date: bookingInfo.date,
        time: bookingInfo.time,
        duration: bookingInfo.duration,
        orderNo: bookingInfo.orderNo
      }
    }, userId)
  },

  addCourseTask(course, enrollInfo, userId) {
    return this.add({
      type: 'course',
      title: course.name,
      subtitle: '报名成功，等待开课',
      amount: course.price,
      status: 'upcoming',
      extra: {
        courseId: course.id,
        orderNo: enrollInfo.orderNo,
        coach: course.coach,
        lessons: course.lessons
      }
    }, userId)
  },

  addCompetitionTask(competition, regInfo, userId) {
    return this.add({
      type: 'competition',
      title: competition.name,
      subtitle: competition.status === 'upcoming' ? '等待比赛开始' : '比赛进行中',
      amount: competition.fee,
      status: competition.status === 'upcoming' ? 'upcoming' : 'ongoing',
      extra: {
        competitionId: competition.id,
        regNo: regInfo.regNo,
        playerNo: regInfo.playerNo,
        date: competition.date
      }
    }, userId)
  },

  addOrderTask(order, userId) {
    return this.add({
      type: 'order',
      title: order.items.map(i => i.name).join('、'),
      subtitle: '已下单，待发货',
      amount: order.amount,
      status: 'pending_shipment',
      extra: {
        orderNo: order.orderNo,
        items: order.items,
        createTime: order.createTime
      }
    }, userId)
  },

  markAsPaid(taskId, userId) {
    const task = this.getById(taskId, userId)
    if (!task) return null

    let newStatus = 'upcoming'
    let newSubtitle = '支付成功'

    if (task.type === 'order') {
      newStatus = 'pending_shipment'
      newSubtitle = '支付成功，待发货'
    } else if (task.type === 'course') {
      newSubtitle = '支付成功，等待开课'
    } else if (task.type === 'booking') {
      newSubtitle = '支付成功，等待使用'
    }

    return this.update(taskId, { status: newStatus, subtitle: newSubtitle }, userId)
  },

  getPendingCount(userId) {
    return this.getByStatus('pending', userId).length
  },

  getCompletedCount(userId) {
    return this.getByStatus('completed', userId).length
  },

  clearAll(userId) {
    saveTasks([], userId)
    logger.info('所有任务已清除')
  }
}

export default taskStore
