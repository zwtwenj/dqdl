import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api', () => ({
  getPlayerTasks: vi.fn(),
  acceptTask: vi.fn(),
}))

import { useTaskStore } from './task'
import { usePlayerStore } from './player'
import { getPlayerTasks, acceptTask } from '../api'

/**
 * 冻结 task store：阶段 2.3 会解 task↔dialog 双向依赖，
 * fetch / acceptCurrentTask 的对外契约（api 调用、list 更新、错误处理）不可变。
 */
describe('task store (行为冻结)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getPlayerTasks.mockReset()
    acceptTask.mockReset()
  })

  it('fetch: 无 playerId 时直接返回，不调用 api', async () => {
    const store = useTaskStore()
    await store.fetch()
    expect(getPlayerTasks).not.toHaveBeenCalled()
  })

  it('fetch: 有 playerId 时拉取任务列表', async () => {
    const player = usePlayerStore()
    player.data = { id: 5 }
    getPlayerTasks.mockResolvedValue({ data: [{ id: 1 }, { id: 2 }] })

    const store = useTaskStore()
    await store.fetch()

    expect(getPlayerTasks).toHaveBeenCalledWith(5)
    expect(store.list).toHaveLength(2)
  })

  it('fetch: api 异常时回退空列表', async () => {
    const player = usePlayerStore()
    player.data = { id: 5 }
    getPlayerTasks.mockRejectedValue(new Error('boom'))

    const store = useTaskStore()
    await store.fetch()

    expect(store.list).toEqual([])
  })

  it('acceptCurrentTask: 成功时 unshift 并标记 accepted', async () => {
    const player = usePlayerStore()
    player.data = { id: 5 }
    acceptTask.mockResolvedValue({ data: { id: 99, description: 'd' } })

    const store = useTaskStore()
    const card = { description: 'd', target: [], reward: [], delivery: null, star: 2 }
    await store.acceptCurrentTask(card)

    expect(acceptTask).toHaveBeenCalledOnce()
    expect(store.list[0].id).toBe(99)
    expect(card.accepted).toBe(true)
    expect(store.loading).toBe(false)
  })

  it('acceptCurrentTask: 失败时写 error 且不抛出', async () => {
    const player = usePlayerStore()
    player.data = { id: 5 }
    acceptTask.mockRejectedValue({ response: { data: { message: '已接取' } }, message: 'x' })

    const store = useTaskStore()
    const card = { description: 'd', target: [], reward: [], delivery: null, star: 1 }
    await store.acceptCurrentTask(card)

    expect(card.error).toBe('已接取')
    expect(store.loading).toBe(false)
  })
})
