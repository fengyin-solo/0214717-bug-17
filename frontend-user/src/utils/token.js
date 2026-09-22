/**
 * 令牌管理模块
 *
 * 功能说明：
 * - 签发、解析、校验令牌
 * - 令牌携带归属用户ID与过期时间，并带签名防篡改
 * - 集中管理 localStorage 中的令牌读写
 *
 * 独立成模块是为了避免 auth.js 与 api.js 之间的循环依赖：
 * api.js（Mock 服务端）只依赖本模块做授权校验，不依赖响应式 authState。
 */

/** localStorage 中存储令牌的键名 */
export const AUTH_TOKEN_KEY = 'billiard_token'

/** 模拟令牌签名密钥（Mock 模式仅用于演示，生产环境由后端签发并校验） */
const TOKEN_SECRET = 'billiard-club-mock-secret'

/** 令牌有效期：7 天（毫秒） */
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * djb2 字符串哈希，用于生成令牌签名
 * 非加密强度，但足以识别被篡改/损坏的 Mock 令牌
 * @param {string} str
 * @returns {string} 36 进制哈希串
 */
function hash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i)
  }
  // 无符号右移保证非负
  return (h >>> 0).toString(36)
}

function sign(payloadB64) {
  return hash(`${payloadB64}.${TOKEN_SECRET}`)
}

/** 字符串 -> base64url（兼容非 ASCII） */
function b64urlEncode(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** base64url -> 字符串 */
function b64urlDecode(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : ''
  return decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)))
}

/**
 * 签发令牌
 * @param {string} userId - 令牌归属用户ID
 * @param {number} [ttlMs] - 有效期（毫秒），默认 TOKEN_TTL_MS
 * @returns {string} 形如 <payload>.<signature> 的令牌
 */
export function issueToken(userId, ttlMs = TOKEN_TTL_MS) {
  const payload = {
    sub: userId,
    iat: Date.now(),
    exp: Date.now() + ttlMs
  }
  const payloadB64 = b64urlEncode(JSON.stringify(payload))
  return `${payloadB64}.${sign(payloadB64)}`
}

/**
 * 解析并校验令牌
 * @param {string|null|undefined} token
 * @returns {{ valid: boolean, reason?: string, userId?: string, expiresAt?: number }}
 *   valid=false 时 reason 取值：missing / malformed / bad_signature / expired
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'missing' }
  }

  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'malformed' }
  }

  const [payloadB64, signature] = parts

  // 签名不一致 -> 令牌被篡改或损坏
  if (sign(payloadB64) !== signature) {
    return { valid: false, reason: 'bad_signature' }
  }

  let payload
  try {
    payload = JSON.parse(b64urlDecode(payloadB64))
  } catch (e) {
    return { valid: false, reason: 'malformed' }
  }

  if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
    return { valid: false, reason: 'malformed' }
  }

  // 过期校验
  if (Date.now() >= payload.exp) {
    return { valid: false, reason: 'expired', userId: payload.sub, expiresAt: payload.exp }
  }

  return { valid: true, userId: payload.sub, expiresAt: payload.exp }
}

/**
 * 从 localStorage 读取并校验当前令牌
 * @returns {{ valid: boolean, reason?: string, userId?: string }}
 */
export function readStoredToken() {
  let token = null
  try {
    token = localStorage.getItem(AUTH_TOKEN_KEY)
  } catch (e) {
    return { valid: false, reason: 'missing' }
  }
  return verifyToken(token)
}

/**
 * 持久化令牌
 * @param {string} token
 * @returns {boolean} 是否写入成功
 */
export function saveToken(token) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
    return true
  } catch (e) {
    return false
  }
}

/** 移除持久化令牌 */
export function clearToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch (e) {
    // localStorage 不可用时忽略
  }
}

export default {
  AUTH_TOKEN_KEY,
  TOKEN_TTL_MS,
  issueToken,
  verifyToken,
  readStoredToken,
  saveToken,
  clearToken
}
