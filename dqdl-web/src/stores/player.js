import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createPlayer, getPlayer, cultivate as apiCultivate, breakthrough as apiBreakthrough } from '../api'

export const usePlayerStore = defineStore('player', () => {
  // ── state（映射 player 表） ──
  const data = ref(null)           // player 表完整数据（含 technique）
  const loading = ref(false)
  const loadingText = ref('')

  // ── getters ──
  const playerId = computed(() => data.value?.id ?? null)
  const money = computed(() => data.value?.money ?? 0)
  const hasSave = computed(() => !!playerId.value)

  // 位置 ID 数组（从 position JSON 解析）
  const positionIds = computed(() => {
    try { return JSON.parse(data.value?.position || '[]') }
    catch { return [] }
  })

  // 当前所在 locationId（位置数组最后一项）
  const currentLocationId = computed(() => {
    const ids = positionIds.value
    return ids.length > 0 ? ids[ids.length - 1] : null
  })

  // ── actions ──
  async function newGame() {
    loading.value = true
    loadingText.value = '英雄降世...'
    try {
      const res = await createPlayer({
        name: '旅行者',
        power: 10, intelligence: 8, quick: 7, stamina: 9, lucky: 6,
        position: '[]',
      })
      const full = await getPlayer(res.data.id)
      data.value = full.data
      return data.value
    } finally {
      loading.value = false
    }
  }

  async function loadPlayer(playerId) {
    loading.value = true
    loadingText.value = '读取存档...'
    try {
      const res = await getPlayer(playerId)
      if (!res.data) throw new Error('玩家数据已丢失')
      data.value = res.data
      return data.value
    } finally {
      loading.value = false
    }
  }

  /** 同步 local money（无需重新拉取 player） */
  function patchMoney(amount) {
    if (data.value) data.value.money = amount
  }

  /** 合并部分字段到 local player（使用物品后同步 hp/energy/buff 等） */
  function patch(partial) {
    if (data.value && partial) data.value = { ...data.value, ...partial }
  }

  /** 修炼：调 API 并更新自身 cultivation/level_cultivation，返回结果供 UI 编排 */
  async function cultivate(qi) {
    if (!playerId.value || qi <= 0) return null
    const res = await apiCultivate(playerId.value, qi)
    const d = res.data
    data.value = { ...data.value, cultivation: d.newCultivation, level_cultivation: d.level_cultivation }
    return d
  }

  /** 突破：调 API 并更新自身 level/cultivation，返回结果（含 narrative）供 UI 编排 */
  async function breakthrough() {
    if (!playerId.value) return null
    const res = await apiBreakthrough(playerId.value)
    const d = res.data
    data.value = { ...data.value, level: d.newLevel, cultivation: d.newCultivation, level_cultivation: d.level_cultivation }
    return d
  }

  return {
    data, loading, loadingText,
    playerId, money, hasSave, positionIds, currentLocationId,
    newGame, loadPlayer, patchMoney, patch, cultivate, breakthrough,
  }
})
