/**
 * taskStore 归属隔离测试
 *
 * 覆盖：
 * - 未绑定用户拒绝读写
 * - 两个用户的任务完全隔离
 * - 不能操作/删除他人任务
 * - clearUserData 只清除指定用户，不影响他人
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { taskStore } from '../utils/taskStore'

const localStorageMock = {
  store: {},
  getItem: vi.fn(key => (Object.prototype.hasOwnProperty.call(localStorageMock.store, key) ? localStorageMock.store[key] : null)),
  setItem: vi.fn((key, value) => { localStorageMock.store[key] = String(value) }),
  removeItem: vi.fn(key => { delete localStorageMock.store[key] }),
  clear: vi.fn(() => { localStorageMock.store = {} })
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true })

describe('taskStore ownership isolation', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    taskStore.bindUser(null)
  })

  it('refuses reads when no user is bound', () => {
    expect(taskStore.getAll()).toEqual([])
    expect(taskStore.getById('anything')).toBeNull()
  })

  it('refuses writes when no user is bound', () => {
    taskStore.add({ type: 'booking', title: 'x' })
    // 未绑定用户不会写入存储，下次读取也看不到
    expect(localStorageMock.setItem).not.toHaveBeenCalled()
    expect(taskStore.getAll()).toEqual([])
  })

  it('stores tasks under the bound user namespace', () => {
    taskStore.bindUser('U1')
    taskStore.add({ type: 'booking', title: 'A 的预约', status: 'upcoming' })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'billiard_user_tasks_U1',
      expect.stringContaining('"userId":"U1"')
    )
  })

  it('keeps two users tasks fully isolated', () => {
    taskStore.bindUser('U1')
    const t1 = taskStore.add({ type: 'booking', title: 'U1 task', status: 'upcoming' })

    taskStore.bindUser('U2')
    const t2 = taskStore.add({ type: 'order', title: 'U2 task', status: 'pending_shipment' })

    // U1 只能看到自己的
    taskStore.bindUser('U1')
    const u1Tasks = taskStore.getAll()
    expect(u1Tasks.some(t => t.id === t1.id)).toBe(true)
    expect(u1Tasks.some(t => t.id === t2.id)).toBe(false)

    // U2 不能读取 U1 的任务
    taskStore.bindUser('U2')
    expect(taskStore.getById(t1.id)).toBeNull()
    expect(taskStore.getById(t2.id)).not.toBeNull()
  })

  it('cannot remove another users task', () => {
    taskStore.bindUser('U1')
    const t1 = taskStore.add({ type: 'booking', title: 'U1 task', status: 'upcoming' })

    taskStore.bindUser('U2')
    expect(taskStore.remove(t1.id)).toBe(false)

    // U1 的数据仍在
    taskStore.bindUser('U1')
    expect(taskStore.getById(t1.id)).not.toBeNull()
  })

  it('clearUserData only removes the target users data', () => {
    taskStore.bindUser('U1')
    taskStore.add({ type: 'booking', title: 'U1 task', status: 'upcoming' })
    taskStore.bindUser('U2')
    taskStore.add({ type: 'booking', title: 'U2 task', status: 'upcoming' })

    taskStore.clearUserData('U1')

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('billiard_user_tasks_U1')
    expect(localStorageMock.store['billiard_user_tasks_U2']).toBeTruthy()
  })

  it('ignores stored container whose userId does not match the key', () => {
    localStorageMock.store['billiard_user_tasks_U1'] = JSON.stringify({
      userId: 'U2', // 归属不匹配（伪造/串号）
      tasks: [{ id: 'x', type: 'booking', status: 'upcoming' }]
    })
    taskStore.bindUser('U1')
    expect(taskStore.getAll()).toEqual([])
  })
})
