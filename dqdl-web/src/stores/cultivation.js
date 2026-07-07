import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { usePlayerStore } from './player'
import { useOverlayStore } from './overlay'
import { cultivationEnter, cultivationCurrent, cultivationStop } from '../api'
import { startCultivation, stopCultivation } from '../services/cultivationSession'
import { Message } from '../utils/message'

export const useCultivationStore = defineStore('cultivation', () => {
  const show = ref(false)
  const loading = ref(false)
  const session = ref(null)
  const events = ref([])

  // 动态 z-index
  const overlayZ = ref(0)
  watch(show, v => {
    overlayZ.value = v ? useOverlayStore().acquire('cultivation') : (useOverlayStore().release('cultivation'), 0)
  })

  const star = computed(() => session.value?.star || 1)
  const rounds = computed(() => session.value?.rounds || 0)
  const maxRounds = computed(() => session.value?.max_rounds || 10)
  const totalGained = computed(() => session.value?.total_gained || 0)

  /** 由奇遇进入洞天福地 */
  async function enterFromEncounter(encounterId) {
    const pid = usePlayerStore().playerId
    loading.value = true
    show.value = true
    events.value = []
    try {
      const res = await cultivationEnter(pid, encounterId)
      session.value = res.data
      startCultivation()
    } catch (e) {
      session.value = null
      show.value = false
      Message.error(e.response?.data?.message || '洞天福地凝聚失败，请重试')
    }
    loading.value = false
  }

  /** 恢复（最小化后重新打开）：拉取当前会话 + 重启 SSE */
  async function resume() {
    const pid = usePlayerStore().playerId
    loading.value = true
    show.value = true
    try {
      const res = await cultivationCurrent(pid)
      session.value = res.data
      startCultivation()
    } catch {
      session.value = null
    }
    loading.value = false
  }

  /** 最小化：仅隐藏面板，会话继续 */
  function minimize() {
    show.value = false
  }

  /** 修炼自动结束（满轮）：本地清理面板，并刷新玩家状态（后端已置 status=1） */
  async function finish() {
    show.value = false
    session.value = null
    events.value = []
    await usePlayerStore().refresh()
  }

  /** 停止修炼：后端结算 + 关 SSE + 关面板，并刷新玩家状态 */
  async function stop() {
    const pid = usePlayerStore().playerId
    await cultivationStop(pid).catch(() => {})
    stopCultivation()
    show.value = false
    session.value = null
    events.value = []
    await usePlayerStore().refresh()
  }

  return {
    show, overlayZ, loading, session, events,
    star, rounds, maxRounds, totalGained,
    enterFromEncounter, resume, minimize, finish, stop,
  }
})
