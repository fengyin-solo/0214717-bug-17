/**
 * 任务数据仓储（按账号隔离的持久化层）
 *
 * 职责：
 * - 每个账号的任务数据使用独立的 localStorage 键存储，账号之间完全隔离
 * - 仅由模拟服务端（mockServer）调用，任何读写都必须携带账号 uid
 * - 页面不允许直接调用本仓储，统一通过 api.getTasks / api.doTaskAction 访问，
 *   由服务端完成令牌校验与归属校验
 */

const STORAGE_PREFIX = 'billiard_db_tasks_'

const logger = {
  info: (...args) => console.log('[taskRepo]', ...args),
  warn: (...args) => console.warn('[taskRepo]', ...args),
  error: (...args) => console.error('[taskRepo]', ...args)
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

function storageKey(uid) {
  return STORAGE_PREFIX + uid
}

function loadTasks(uid) {
  try {
    const stored = localStorage.getItem(storageKey(uid))
    return stored ? JSON.parse(stored) : []
  } catch (e) {
    logger.error('加载任务失败', e)
    return []
  }
}

function saveTasks(uid, tasks) {
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(tasks))
    return true
  } catch (e) {
    logger.error('保存任务失败', e)
    return false
  }
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
    actions
  }
}

/** 首次进入账号时填充演示任务 */
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
      extra: { tableId: 3, date: '2026-02-15', time: '14:00 - 16:00', orderNo: 'BK20260001' }
    },
    {
      id: 'T' + Date.now().toString() + '002',
      type: 'course',
      title: '台球入门基础课',
      subtitle: '报名成功，等待开课',
      amount: 599,
      status: 'upcoming',
      createdAt: formatDate(new Date(Date.now() - 259200000)),
      extra: { courseId: 1, orderNo: 'CR20260001' }
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
      extra: { orderNo: 'SP20260001', productId: 1 }
    }
  ]
}

export const taskRepo = {
  STORAGE_PREFIX,

  /** 若该账号从未初始化过任务，则写入默认演示任务 */
  seedDefaults(uid) {
    if (localStorage.getItem(storageKey(uid)) === null) {
      saveTasks(uid, getDefaultTasks())
    }
  },

  getAll(uid) {
    return loadTasks(uid).map(enrichTask).sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    )
  },

  getByStatus(uid, status) {
    const tasks = this.getAll(uid)
    if (status === 'pending') {
      return tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
    }
    if (status === 'completed') {
      return tasks.filter(t => t.status === 'completed')
    }
    return tasks
  },

  getById(uid, taskId) {
    const task = loadTasks(uid).find(t => t.id === taskId)
    return task ? enrichTask(task) : null
  },

  /**
   * 查找任务归属账号（不校验权限，仅供服务端判断归属）
   * @returns {{uid: string}|null}
   */
  findOwner(taskId) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue
      let tasks
      try {
        tasks = JSON.parse(localStorage.getItem(key))
      } catch {
        continue
      }
      if (Array.isArray(tasks) && tasks.some(t => t.id === taskId)) {
        return { uid: key.slice(STORAGE_PREFIX.length) }
      }
    }
    return null
  },

  add(uid, taskData) {
    const tasks = loadTasks(uid)
    const newTask = {
      id: generateTaskId(),
      createdAt: formatDate(new Date()),
      ...taskData
    }
    tasks.unshift(newTask)
    saveTasks(uid, tasks)
    logger.info('任务已添加', { uid, taskId: newTask.id })
    return enrichTask(newTask)
  },

  update(uid, taskId, updates) {
    const tasks = loadTasks(uid)
    const index = tasks.findIndex(t => t.id === taskId)
    if (index === -1) {
      logger.warn('任务不存在', taskId)
      return null
    }
    tasks[index] = { ...tasks[index], ...updates }
    saveTasks(uid, tasks)
    logger.info('任务已更新', { uid, taskId })
    return enrichTask(tasks[index])
  },

  updateStatus(uid, taskId, newStatus) {
    if (!statusConfig[newStatus]) {
      logger.error('无效的状态', newStatus)
      return null
    }
    return this.update(uid, taskId, { status: newStatus })
  },

  remove(uid, taskId) {
    const tasks = loadTasks(uid)
    const filtered = tasks.filter(t => t.id !== taskId)
    if (filtered.length === tasks.length) {
      logger.warn('任务不存在，无法删除', taskId)
      return false
    }
    saveTasks(uid, filtered)
    logger.info('任务已删除', { uid, taskId })
    return true
  },

  markAsPaid(uid, taskId) {
    const task = this.getById(uid, taskId)
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

    return this.update(uid, taskId, { status: newStatus, subtitle: newSubtitle })
  },

  clearFor(uid) {
    localStorage.removeItem(storageKey(uid))
    logger.info('账号任务数据已清除', { uid })
  }
}

export default taskRepo
