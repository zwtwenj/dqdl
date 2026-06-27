import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { cultivationRoomConfig, enterCultivationRoom, getCultivationRoom, stopCultivationRoom } from '../api'
import { usePlayerStore } from './player'
import { Message } from '../utils/message'
import { startRoomStream, stopRoomStream } from '../services/cultivationRoomSession'

/**
 * 城内修炼室：先选档位(一/二/三阶) → 再选修炼内容(斗气/功法，斗技暂未开放)。
 * 修炼斗气=玩家突破修为；修炼功法=选定功法的修为（满即停，功法突破暂未做）。
 */
export const useCultivationRoomStore = defineStore('cultivationRoom', () => {
  const showPanel = ref(false)
  const tiers = ref([])        // [{ tier, name, cost, qi }]
  const interval = ref(0)
  const session = ref(null)    // 进行中的会话
  const progress = ref(null)   // { mode, name, level, current, max } 当前进度（斗气槽/功法槽）
  const loading = ref(false)
  const stopReason = ref(null)

  // 选择向导状态
  const step = ref('tier')          // 'tier' | 'type' | 'technique'
  const selectedTier = ref(null)

  const isActive = computed(() => !!session.value)

  async function open() {
    showPanel.value = true
    step.value = 'tier'
    selectedTier.value = null
    stopReason.value = null
    loading.value = true
    try {
      await fetchConfig()
      await fetchCurrent() // 已有进行中的会话则恢复（直接进实时视图）
    } finally { loading.value = false }
  }
  function close() { showPanel.value = false }

  async function fetchConfig() {
    try {
      const res = await cultivationRoomConfig()
      tiers.value = res.data?.tiers || []
      interval.value = res.data?.interval || 0
    } catch { tiers.value = [] }
  }

  async function fetchCurrent() {
    const pid = usePlayerStore().playerId
    if (!pid) return
    try {
      const res = await getCultivationRoom(pid)
      session.value = res.data
      progress.value = res.data?.progress || null
      if (session.value) startRoomStream()
    } catch { session.value = null; progress.value = null }
  }

  function pickTier(tier) { selectedTier.value = tier; step.value = 'type' }
  function goTier() { step.value = 'tier' }
  function goType() { step.value = 'type' }
  function goTechniquePicker() { step.value = 'technique' }

  async function enter(tier, mode = 'qi', techniqueId = null) {
    const pid = usePlayerStore().playerId
    if (!pid || loading.value) return
    loading.value = true
    try {
      const res = await enterCultivationRoom(pid, tier, mode, techniqueId)
      session.value = res.data
      progress.value = res.data?.progress || null
      stopReason.value = null
      startRoomStream()
    } catch (err) {
      Message.error(err.response?.data?.message || '进入修炼室失败')
    } finally {
      loading.value = false
    }
  }

  async function stop() {
    const pid = usePlayerStore().playerId
    if (!pid) return
    try { await stopCultivationRoom(pid) } catch { /* ignore */ }
    stopRoomStream()
    session.value = null
    stopReason.value = 'stopped'
    // 修炼改变了玩家数据（尤其功法修为），刷新以保证角色面板不显示旧值
    await usePlayerStore().refresh()
  }

  /** SSE 回调：收到一次结算 */
  function applySettle(data) {
    if (!data) return
    if (session.value) {
      session.value.rounds = data.rounds
      session.value.total_gained = data.total_gained
      session.value.total_cost = data.total_cost
    }
    progress.value = data.progress
    const playerStore = usePlayerStore()
    if (playerStore.data) {
      const patch = { money: data.money }
      // 斗气模式同步玩家修为到角色面板
      if (data.mode === 'qi') { patch.cultivation = data.progress?.current ?? 0; patch.level_cultivation = data.progress?.max ?? 0 }
      playerStore.data = { ...playerStore.data, ...patch }
    }
    if (data.finished) {
      stopRoomStream()
      session.value = null
      stopReason.value = data.reason || 'finished'
      // 功法修炼尤其需要刷新（technique 进度只有 getPlayer 才带回完整列表）
      usePlayerStore().refresh()
    }
  }

  return {
    showPanel, tiers, interval, session, progress, loading, stopReason, isActive,
    step, selectedTier,
    open, close, fetchConfig, fetchCurrent, enter, stop, applySettle,
    pickTier, goTier, goType, goTechniquePicker,
  }
})
