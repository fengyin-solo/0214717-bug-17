/**
 * 模拟服务端（Mock Server）
 *
 * 功能说明：
 * - 签发带签名与过期时间的令牌（HMAC-SHA256），损坏/篡改/过期令牌一律拒绝
 * - 所有受保护接口必须携带有效令牌，且只能访问令牌所属账号的数据
 * - 写操作（预约/报名/订单/任务操作/资料修改/积分兑换）强制校验资源归属
 * - 用户数据按账号隔离存储，模拟服务端持久化（刷新页面后仍然存在）
 *
 * 注意：本模块仅用于前端演示，密钥写在前端仅用于演示令牌的防篡改能力，
 * 真实环境下的令牌签发与校验必须由后端完成。
 */

import { taskRepo } from './taskStore'

// ==================== 常量 ====================

/** 演示用签名密钥（真实环境必须保存在服务端） */
const TOKEN_SECRET = 'billiard-mock-server-secret-v1'

/** 服务端用户注册表的存储键 */
const USERS_KEY = 'billiard_db_users_v1'

/** 令牌默认有效期：7天 */
const DEFAULT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** 测试可覆盖的令牌有效期 */
let tokenTtlMs = DEFAULT_TOKEN_TTL_MS

/** 测试可调整的服务端时钟偏移（模拟时间流逝，用于过期场景） */
let clockOffsetMs = 0

// ==================== 基础编码工具 ====================

const encoder = new TextEncoder()

function bytesToBase64Url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ==================== SHA-256 / HMAC-SHA256 ====================

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
])

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n))
}

/**
 * 计算 SHA-256
 * @param {Uint8Array} data 输入字节
 * @returns {Uint8Array} 32字节摘要
 */
function sha256(data) {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ])

  const bitLength = data.length * 8
  const totalLength = Math.ceil((data.length + 9) / 64) * 64
  const buffer = new Uint8Array(totalLength)
  buffer.set(data)
  buffer[data.length] = 0x80
  const view = new DataView(buffer.buffer)
  view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(totalLength - 4, bitLength >>> 0)

  const w = new Uint32Array(64)

  for (let offset = 0; offset < totalLength; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let [a, b, c, d, e, f, g, hh] = h

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (hh + SHA256_K[i] + w[i] + S1 + ch) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0
      hh = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h[0] = (h[0] + a) >>> 0
    h[1] = (h[1] + b) >>> 0
    h[2] = (h[2] + c) >>> 0
    h[3] = (h[3] + d) >>> 0
    h[4] = (h[4] + e) >>> 0
    h[5] = (h[5] + f) >>> 0
    h[6] = (h[6] + g) >>> 0
    h[7] = (h[7] + hh) >>> 0
  }

  const output = new Uint8Array(32)
  const outputView = new DataView(output.buffer)
  for (let i = 0; i < 8; i++) outputView.setUint32(i * 4, h[i])
  return output
}

function hmacSha256(key, message) {
  let keyBytes = typeof key === 'string' ? encoder.encode(key) : key
  if (keyBytes.length > 64) keyBytes = sha256(keyBytes)
  const paddedKey = new Uint8Array(64)
  paddedKey.set(keyBytes)

  const inner = new Uint8Array(64 + message.length)
  const outer = new Uint8Array(64)
  for (let i = 0; i < 64; i++) {
    inner[i] = paddedKey[i] ^ 0x36
    outer[i] = paddedKey[i] ^ 0x5c
  }
  inner.set(message, 64)

  const innerHash = sha256(inner)
  const outerInput = new Uint8Array(64 + 32)
  outerInput.set(outer, 0)
  outerInput.set(innerHash, 64)
  return sha256(outerInput)
}

// ==================== 令牌签发与校验 ====================

function serverNow() {
  return Date.now() + clockOffsetMs
}

/**
 * 签发令牌
 * @param {string} uid 用户ID
 * @param {number} [ttlMs] 有效期（测试用）
 * @returns {string} 格式 mock.<payload>.<signature>
 */
function issueToken(uid, ttlMs = tokenTtlMs) {
  const issuedAt = serverNow()
  const payload = { uid, iat: issuedAt, exp: issuedAt + ttlMs }
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = bytesToBase64Url(hmacSha256(TOKEN_SECRET, encoder.encode(body)))
  return `mock.${body}.${signature}`
}

/**
 * 校验令牌
 * @param {string} token
 * @returns {{valid: boolean, payload?: Object, reason?: string}}
 */
function verifyToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return { valid: false, reason: 'missing-token' }
  }
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'mock') {
    return { valid: false, reason: 'malformed-token' }
  }
  const [, body, signature] = parts

  let payloadBytes
  try {
    payloadBytes = base64UrlToBytes(body)
  } catch {
    return { valid: false, reason: 'malformed-token' }
  }

  const expectedSignature = bytesToBase64Url(hmacSha256(TOKEN_SECRET, encoder.encode(body)))
  if (!timingSafeEqual(signature, expectedSignature)) {
    return { valid: false, reason: 'invalid-signature' }
  }

  let payload
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes))
  } catch {
    return { valid: false, reason: 'malformed-token' }
  }

  if (!payload || typeof payload.uid !== 'string' || typeof payload.exp !== 'number') {
    return { valid: false, reason: 'malformed-token' }
  }

  if (payload.exp <= serverNow()) {
    return { valid: false, reason: 'expired', payload }
  }

  return { valid: true, payload }
}

// ==================== 服务端数据存储 ====================

function loadUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || {}
  } catch {
    return {}
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function seedDefaultUsers() {
  const users = loadUsers()
  if (!users.U20260001) {
    users.U20260001 = {
      uid: 'U20260001',
      username: 'user',
      password: '123456',
      profile: {
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
      }
    }
    saveUsers(users)
    taskRepo.seedDefaults('U20260001')
  }
  return users
}

// ==================== 公共目录数据（受控内容，登录前后均可查看） ====================

const catalog = {
  tables: [
    { id: 1, name: '1号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: true, size: '12尺', brand: '星牌' },
    { id: 2, name: '2号球桌', type: '斯诺克', typeId: 'snooker', price: 80, available: false, size: '12尺', brand: '星牌' },
    { id: 3, name: '3号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
    { id: 4, name: '4号球桌', type: '美式九球', typeId: 'pool', price: 60, available: true, size: '9尺', brand: 'Brunswick' },
    { id: 5, name: '5号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: false, size: '9尺', brand: '乔氏' },
    { id: 6, name: '6号球桌', type: '中式八球', typeId: 'chinese', price: 50, available: true, size: '9尺', brand: '乔氏' }
  ],
  courses: [
    { id: 1, name: '台球入门基础课', icon: '🎯', level: '入门', duration: '4周', lessons: '8课时', students: 156, price: 599, originalPrice: 799, description: '从零开始学习台球', coach: '张明', coachTitle: '高级教练' },
    { id: 2, name: '斯诺克进阶训练', icon: '🎱', level: '进阶', duration: '6周', lessons: '12课时', students: 89, price: 1299, originalPrice: 1599, description: '深入学习斯诺克战术', coach: '李强', coachTitle: '国家级教练' },
    { id: 3, name: '九球高级技巧', icon: '🏆', level: '高级', duration: '8周', lessons: '16课时', students: 45, price: 1999, originalPrice: 2499, description: '掌握高级杆法与实战', coach: '王磊', coachTitle: '职业选手' },
    { id: 4, name: '比赛心理训练', icon: '🧠', level: '专业', duration: '3周', lessons: '6课时', students: 32, price: 999, description: '提升比赛心理素质', coach: '赵芳', coachTitle: '运动心理师' }
  ],
  competitions: [
    { id: 1, name: '2026春季斯诺克公开赛', type: '斯诺克', date: '2026-03-15', location: '主馆A区', prize: 50000, fee: 200, participants: 28, maxParticipants: 32, status: 'upcoming' },
    { id: 2, name: '周末九球挑战赛', type: '美式九球', date: '2026-02-14', location: '主馆B区', prize: 10000, fee: 100, participants: 16, maxParticipants: 16, status: 'ongoing' },
    { id: 3, name: '新年中式八球锦标赛', type: '中式八球', date: '2026-01-20', location: '主馆A区', prize: 30000, fee: 150, participants: 64, maxParticipants: 64, status: 'finished' },
    { id: 4, name: '会员积分争霸赛', type: '综合', date: '2026-04-01', location: '主馆C区', prize: 20000, fee: 50, participants: 12, maxParticipants: 48, status: 'upcoming' },
    { id: 5, name: '女子台球精英赛', type: '美式九球', date: '2026-03-08', location: '主馆B区', prize: 15000, fee: 80, participants: 8, maxParticipants: 16, status: 'upcoming' }
  ],
  products: [
    { id: 1, name: 'LP专业斯诺克球杆', brand: 'LP', price: 2999, originalPrice: 3599, category: 'cue', icon: '🏏', description: '进口白蜡木杆身，专业级配置', sales: 328, hot: true },
    { id: 2, name: 'Predator美式九球杆', brand: 'Predator', price: 4599, category: 'cue', icon: '🏏', description: '碳纤维前节，低偏转技术', sales: 156, new: true },
    { id: 3, name: '星牌比赛用球', brand: '星牌', price: 1299, originalPrice: 1499, category: 'ball', icon: '🎱', description: '国际比赛标准，酚醛树脂材质', sales: 892, hot: true },
    { id: 4, name: 'Aramith水晶球套装', brand: 'Aramith', price: 2199, category: 'ball', icon: '🎱', description: '比利时进口，透明水晶材质', sales: 234 },
    { id: 5, name: 'Master专业巧克粉', brand: 'Master', price: 39, category: 'accessory', icon: '🧊', description: '美国原装进口，防滑效果好', sales: 2341, hot: true },
    { id: 6, name: '球杆延长器', brand: 'Generic', price: 199, originalPrice: 259, category: 'accessory', icon: '🔧', description: '铝合金材质，轻便耐用', sales: 567 },
    { id: 7, name: 'Kamui台球手套', brand: 'Kamui', price: 89, category: 'accessory', icon: '🧤', description: '日本进口，透气舒适', sales: 1234 },
    { id: 8, name: '专业比赛马甲', brand: 'Billiard Pro', price: 299, category: 'clothing', icon: '🎽', description: '修身剪裁，舒适透气', sales: 445, new: true }
  ]
}

// ==================== 响应工具 ====================

function ok(data) {
  return { ok: true, status: 200, data }
}

function fail(status, error) {
  return { ok: false, status, error }
}

function parseBody(options) {
  try {
    return JSON.parse(options.body || '{}')
  } catch {
    return null
  }
}

function generateNo(prefix) {
  return prefix + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10)
}

/** 任务状态 -> 预约展示状态 */
function toBookingStatus(taskStatus) {
  if (taskStatus === 'completed') return 'completed'
  if (taskStatus === 'cancelled') return 'cancelled'
  return 'upcoming'
}

function taskToBooking(task) {
  return {
    id: task.id,
    orderNo: task.extra?.orderNo || task.id,
    tableName: task.title,
    date: task.extra?.date || '',
    time: task.extra?.time || '',
    amount: task.amount,
    status: toBookingStatus(task.status)
  }
}

// ==================== 路由处理 ====================

/**
 * 处理模拟请求
 * @param {string} url 请求路径
 * @param {Object} options { method, body, params, token }
 * @returns {{ok: boolean, status: number, data?: any, error?: string}}
 */
function dispatch(url, options = {}) {
  const method = options.method || 'GET'
  const body = parseBody(options)
  const params = options.params || {}

  // ---------- 认证相关（公开/半公开） ----------
  if (url === '/auth/login' && method === 'POST') return handleLogin(body)
  if (url === '/auth/logout' && method === 'POST') return ok({ message: '退出成功' })

  // ---------- 公共只读目录：任何访客都可查看受控内容 ----------
  if (url === '/tables' && method === 'GET') return ok(catalog.tables)
  if (url === '/courses' && method === 'GET') return ok(catalog.courses)
  if (url === '/competitions' && method === 'GET') return ok(catalog.competitions)
  if (url === '/products' && method === 'GET') return ok(catalog.products)

  // ---------- 以下全部为受保护资源：必须携带有效令牌 ----------
  const verdict = verifyToken(options.token)
  if (!verdict.valid) {
    const messageMap = {
      'missing-token': '未登录，请先登录',
      'expired': '登录已过期，请重新登录',
      'invalid-signature': '登录凭证无效，请重新登录',
      'malformed-token': '登录凭证已损坏，请重新登录'
    }
    return fail(401, messageMap[verdict.reason] || '登录状态无效，请重新登录')
  }
  const uid = verdict.payload.uid
  const users = loadUsers()
  const account = users[uid]
  if (!account) return fail(401, '账号不存在或已注销，请重新登录')

  if (url === '/auth/me' && method === 'GET') return ok(account.profile)

  if (url === '/user/profile' && method === 'GET') return ok(account.profile)

  if (url === '/user/profile' && method === 'PUT') return handleUpdateProfile(users, account, body)
  if (url === '/user/points/exchange' && method === 'POST') return handleExchangePoints(users, account, body)

  if (url === '/bookings' && method === 'GET') {
    return ok(taskRepo.getAll(uid).filter(t => t.type === 'booking').map(taskToBooking))
  }
  if (url === '/bookings' && method === 'POST') return handleCreateBooking(uid, body)

  if (url === '/courses/enroll' && method === 'POST') return handleEnrollCourse(uid, body)
  if (url === '/competitions/join' && method === 'POST') return handleJoinCompetition(uid, body)

  if (url === '/orders' && method === 'GET') return handleGetOrders(uid)
  if (url === '/orders' && method === 'POST') return handleCreateOrder(uid, body)

  if (url === '/user/tasks' && method === 'GET') {
    return ok(params.status ? taskRepo.getByStatus(uid, params.status) : taskRepo.getAll(uid))
  }
  if (url === '/user/tasks' && method === 'POST') return handleTaskAction(uid, body)

  return fail(404, `API not found: ${method} ${url}`)
}

function handleLogin(body) {
  const { username, password } = body || {}
  if (!username || !password) return fail(400, '请输入用户名和密码')

  const users = seedDefaultUsers()
  const account = Object.values(users).find(u => u.username === username)
  if (!account || account.password !== password) {
    return fail(401, '用户名或密码错误')
  }

  // 登录即代表重新建立会话，确保该账号的任务数据已初始化
  taskRepo.seedDefaults(account.uid)
  return ok({ token: issueToken(account.uid), user: account.profile })
}

function handleUpdateProfile(users, account, body) {
  if (!body || typeof body !== 'object') return fail(400, '资料内容无效')
  const next = { ...account.profile }

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (name.length < 2) return fail(400, '昵称至少需要2个字符')
    next.name = name
  }
  if (body.phone !== undefined && body.phone !== '') {
    if (!/^1[3-9]\d{9}$/.test(String(body.phone))) return fail(400, '请输入正确的手机号码')
    next.phone = String(body.phone)
  }
  if (body.email !== undefined && body.email !== '') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email))) return fail(400, '请输入正确的邮箱地址')
    next.email = String(body.email)
  }

  // 积分、等级、统计等字段不允许通过资料接口修改
  account.profile = next
  users[account.uid] = account
  saveUsers(users)
  return ok(next)
}

function handleExchangePoints(users, account, body) {
  const points = Number(body?.points)
  if (!Number.isInteger(points) || points <= 0) return fail(400, '兑换积分数量无效')
  if (points > account.profile.points) return fail(400, '积分余额不足')

  account.profile = { ...account.profile, points: account.profile.points - points }
  users[account.uid] = account
  saveUsers(users)
  return ok({ points: account.profile.points, profile: account.profile })
}

function handleCreateBooking(uid, body) {
  const table = body?.table
  if (!table?.id || !body.date || !body.time || !body.duration) {
    return fail(400, '预约信息不完整')
  }
  const orderNo = generateNo('BK')
  taskRepo.add(uid, {
    type: 'booking',
    title: `${table.name} - ${table.type}`,
    subtitle: `${body.date} ${body.time}`,
    amount: table.price * Number(body.duration),
    status: 'pending_payment',
    extra: {
      tableId: table.id,
      date: body.date,
      time: body.time,
      duration: Number(body.duration),
      orderNo
    }
  })
  return ok({
    orderNo,
    tableName: `${table.name} - ${table.type}`,
    date: body.date,
    time: body.time,
    duration: Number(body.duration),
    amount: table.price * Number(body.duration),
    status: 'upcoming'
  })
}

function handleEnrollCourse(uid, body) {
  const course = body?.course
  if (!course?.id) return fail(400, '报名课程信息不完整')
  const orderNo = generateNo('CR')
  taskRepo.add(uid, {
    type: 'course',
    title: course.name,
    subtitle: '报名成功，等待开课',
    amount: course.price,
    status: 'upcoming',
    extra: {
      courseId: course.id,
      orderNo,
      coach: course.coach,
      lessons: course.lessons
    }
  })
  return ok({ orderNo })
}

function handleJoinCompetition(uid, body) {
  const competition = catalog.competitions.find(c => c.id === Number(body?.competitionId))
  if (!competition) return fail(404, '赛事不存在')
  if (competition.status !== 'upcoming') return fail(400, '该赛事当前不可报名')

  const regNo = generateNo('REG')
  const playerNo = Math.floor(Math.random() * 100) + 1
  taskRepo.add(uid, {
    type: 'competition',
    title: competition.name,
    subtitle: competition.status === 'upcoming' ? '等待比赛开始' : '比赛进行中',
    amount: competition.fee,
    status: competition.status === 'upcoming' ? 'upcoming' : 'ongoing',
    extra: { competitionId: competition.id, regNo, playerNo, date: competition.date }
  })
  return ok({ regNo, playerNo })
}

function handleGetOrders(uid) {
  return ok(
    taskRepo.getAll(uid)
      .filter(t => t.type === 'order')
      .map(t => ({
        orderNo: t.extra?.orderNo || t.id,
        items: t.extra?.items || [],
        amount: t.amount,
        status: 'paid',
        createTime: t.extra?.createTime || t.createdAt
      }))
  )
}

function handleCreateOrder(uid, body) {
  const items = Array.isArray(body?.items) ? body.items : []
  if (items.length === 0) return fail(400, '订单商品为空')
  const amount = Number(body.amount)
  if (!Number.isFinite(amount) || amount < 0) return fail(400, '订单金额无效')

  const orderNo = generateNo('SP')
  const createTime = new Date().toLocaleString()
  taskRepo.add(uid, {
    type: 'order',
    title: items.map(i => i.name).filter(Boolean).join('、') || '商城订单',
    subtitle: '已下单，待发货',
    amount,
    status: 'pending_shipment',
    extra: { orderNo, items, createTime }
  })
  return ok({ orderNo, items, amount, status: 'paid', createTime })
}

function handleTaskAction(uid, body) {
  const { taskId, action } = body || {}
  if (!taskId || !action) return fail(400, '缺少任务参数')

  // 归属校验：任务存在但属于其他账号 -> 403；不存在 -> 404
  const owner = taskRepo.findOwner(taskId)
  if (owner && owner.uid !== uid) {
    return fail(403, '无权操作他人的任务数据')
  }
  if (!owner) return fail(404, '任务不存在')

  switch (action) {
    case 'pay': {
      const updated = taskRepo.markAsPaid(uid, taskId)
      return updated ? ok({ success: true, message: '支付成功' }) : fail(404, '任务不存在')
    }
    case 'cancel': {
      const removed = taskRepo.remove(uid, taskId)
      return removed ? ok({ success: true, message: '取消成功' }) : fail(404, '任务不存在')
    }
    case 'confirm': {
      const updated = taskRepo.update(uid, taskId, { status: 'completed', subtitle: '已完成' })
      return updated ? ok({ success: true, message: '确认成功' }) : fail(404, '任务不存在')
    }
    case 'remind':
      return ok({ success: true, message: '已提醒卖家发货' })
    case 'view':
    case 'rebook':
    case 'rebuy':
    case 'review':
      return ok({ success: true, message: '操作成功' })
    default:
      return fail(400, `不支持的操作：${action}`)
  }
}

// ==================== 测试辅助接口（仅演示/测试环境使用） ====================

const mockServerTest = {
  /** 创建并持久化一个账号（用于跨账号隔离测试） */
  createUser({ uid = 'U' + Date.now(), username = 'user' + Date.now(), password = '123456', profile } = {}) {
    const users = loadUsers()
    const user = {
      uid,
      username,
      password,
      profile: profile || {
        id: uid,
        name: '测试用户' + uid,
        level: '普通',
        points: 100,
        totalHours: 0,
        competitions: 0,
        wins: 0,
        courses: 0,
        phone: '',
        email: ''
      }
    }
    users[uid] = user
    saveUsers(users)
    return user
  },
  /** 直接为指定账号签发令牌 */
  issueToken,
  /** 调整服务端时钟（毫秒），模拟时间流逝 */
  setClockOffset(ms) {
    clockOffsetMs = ms
  },
  /** 设置令牌有效期（毫秒） */
  setTokenTtlMs(ms) {
    tokenTtlMs = ms
  },
  /** 清空全部服务端模拟数据 */
  resetAll() {
    const keysToRemove = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key === USERS_KEY || key.startsWith(taskRepo.STORAGE_PREFIX)) keysToRemove.push(key)
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    clockOffsetMs = 0
    tokenTtlMs = DEFAULT_TOKEN_TTL_MS
  }
}

// ==================== 导出 ====================

export const mockServer = {
  dispatch,
  verifyToken,
  issueToken,
  catalog,
  test: mockServerTest
}

export default mockServer
