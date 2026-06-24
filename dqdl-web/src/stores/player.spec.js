import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../api', () => ({
  createPlayer: vi.fn(),
  getPlayer: vi.fn(),
  cultivate: vi.fn(),
  breakthrough: vi.fn(),
}))

import { usePlayerStore } from './player'
import { createPlayer, getPlayer } from '../api'

/** 冻结 player store：阶段 2.2 会补 doCultivate/doBreakthrough，现有契约不可变。 */
describe('player store (行为冻结)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    createPlayer.mockReset()
    getPlayer.mockReset()
  })

  it('newGame: 创建玩家并拉取完整数据', async () => {
    createPlayer.mockResolvedValue({ data: { id: 7 } })
    getPlayer.mockResolvedValue({ data: { id: 7, name: '旅行者', position: '[1]' } })

    const store = usePlayerStore()
    const p = await store.newGame()

    expect(p.id).toBe(7)
    expect(store.data.id).toBe(7)
    expect(store.playerId).toBe(7)
    expect(store.loading).toBe(false)
    expect(createPlayer).toHaveBeenCalledOnce()
  })

  it('loadPlayer: 读取并存入 data', async () => {
    getPlayer.mockResolvedValue({ data: { id: 5, name: 'x', position: '[1,2]' } })

    const store = usePlayerStore()
    await store.loadPlayer(5)

    expect(store.data.id).toBe(5)
    expect(getPlayer).toHaveBeenCalledWith(5)
  })

  it('位置 getter：从 position JSON 解析 ID 与当前 locationId', () => {
    const store = usePlayerStore()
    store.data = { id: 1, position: '[3, 7, 12]' }
    expect(store.positionIds).toEqual([3, 7, 12])
    expect(store.currentLocationId).toBe(12)
  })

  it('位置非法 JSON 回退空数组', () => {
    const store = usePlayerStore()
    store.data = { id: 1, position: 'bad' }
    expect(store.positionIds).toEqual([])
    expect(store.currentLocationId).toBeNull()
  })

  it('patchMoney / patch 同步本地字段', () => {
    const store = usePlayerStore()
    store.data = { id: 1, money: 0 }
    store.patchMoney(500)
    expect(store.money).toBe(500)
    store.patch({ hp: 80 })
    expect(store.data.hp).toBe(80)
    expect(store.data.money).toBe(500) // patch 合并不丢字段
  })

  it('cultivate: 调 api 并更新 cultivation/level_cultivation', async () => {
    const { cultivate: apiCultivate } = await import('../api')
    apiCultivate.mockResolvedValue({ data: { gained: 20, critical: false, capped: false, newCultivation: 20, level_cultivation: 100 } })
    const store = usePlayerStore()
    store.data = { id: 9, cultivation: 0, level_cultivation: 100 }
    const d = await store.cultivate(150)
    expect(d.newCultivation).toBe(20)
    expect(store.data.cultivation).toBe(20)
    expect(apiCultivate).toHaveBeenCalledWith(9, 150)
  })

  it('breakthrough: 调 api 并更新 level/cultivation', async () => {
    const { breakthrough: apiBreakthrough } = await import('../api')
    apiBreakthrough.mockResolvedValue({ data: { success: true, newLevel: 2, newCultivation: 0, level_cultivation: 400, gained: 1, narrative: '...' } })
    const store = usePlayerStore()
    store.data = { id: 9, level: 1, cultivation: 100, level_cultivation: 100 }
    const d = await store.breakthrough()
    expect(d.newLevel).toBe(2)
    expect(store.data.level).toBe(2)
    expect(store.data.level_cultivation).toBe(400)
  })
})
