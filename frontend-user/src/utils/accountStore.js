/**
 * 用户资料存储模块
 *
 * 功能说明：
 * - 按用户ID隔离持久化用户资料（昵称/手机/邮箱/积分等编辑结果）
 * - 存储容器带 userId 归属字段，读取时校验归属，防止串号
 * - 纯函数式模块，不依赖 Vue 响应式状态，避免 auth <-> api 循环依赖
 */

const STORE_KEY_PREFIX = 'billiard_user_profile_'

/** 旧版本未按用户隔离的全局用户信息键，用于一次性清理 */
const LEGACY_USER_KEY = 'billiard_user'

/**
 * @param {string} userId
 * @returns {string}
 */
function storageKeyFor(userId) {
  return `${STORE_KEY_PREFIX}${userId}`
}

/**
 * 读取某个用户本地缓存的资料
 * @param {string} userId
 * @returns {Object|null}
 */
export function loadProfile(userId) {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(storageKeyFor(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // 归属校验：容器内的 userId 必须与键对应，不一致则丢弃
    if (!parsed || parsed.userId !== userId || !parsed.profile) {
      return null
    }
    return parsed.profile
  } catch (e) {
    return null
  }
}

/**
 * 保存（合并）某个用户的资料
 * @param {string} userId
 * @param {Object} profile
 * @returns {Object|null} 合并后的资料；未绑定用户或写入失败返回 null
 */
export function saveProfile(userId, profile) {
  if (!userId || !profile || typeof profile !== 'object') return null
  const merged = { ...loadProfile(userId), ...profile }
  try {
    localStorage.setItem(
      storageKeyFor(userId),
      JSON.stringify({ userId, profile: merged })
    )
    return merged
  } catch (e) {
    return null
  }
}

/**
 * 清除某个用户的本地资料
 * @param {string} userId
 */
export function clearProfile(userId) {
  try {
    if (userId) {
      localStorage.removeItem(storageKeyFor(userId))
    }
    localStorage.removeItem(LEGACY_USER_KEY)
  } catch (e) {
    // ignore
  }
}

export default { loadProfile, saveProfile, clearProfile }
