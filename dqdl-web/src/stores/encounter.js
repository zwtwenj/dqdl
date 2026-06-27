import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePlayerStore } from './player'
import { useDungeonStore } from './dungeon'
import { useCultivationStore } from './cultivation'
import { getEncounters, abandonEncounter } from '../api'
import { Message } from '../utils/message'

export const useEncounterStore = defineStore('encounter', () => {
  const show = ref(false)
  const list = ref([])
  const loading = ref(false)

  async function fetch() {
    const pid = usePlayerStore().playerId
    if (!pid) return
    loading.value = true
    try {
      const res = await getEncounters(pid)
      list.value = res.data || []
    } catch {
      list.value = []
    }
    loading.value = false
  }

  function open() {
    show.value = true
    fetch()
  }

  function close() {
    show.value = false
  }

  async function abandon(id) {
    const pid = usePlayerStore().playerId
    try {
      await abandonEncounter(id, pid)
      await fetch()
    } catch {
      Message.error('放弃失败')
    }
  }

  /** 进入奇遇：按 status（pending/entered）+ kind 分流 */
  async function enter(id) {
    const en = list.value.find((e) => e.id === id)
    if (!en) return
    // pending 进入且正在历练：二次确认，确认后自动停止历练再进入
    if (en.status === 'pending' && usePlayerStore().data?.status === 2) {
      if (!window.confirm('进入将自动停止当前历练，是否确定进入？')) return
      const { stopAutoTraining } = await import('../services/trainingSession')
      stopAutoTraining()
      await new Promise(r => setTimeout(r, 300)) // 等待后端恢复 status=1
    }
    show.value = false // 立即关闭奇遇面板，避免与副本/修炼面板叠加
    if (en.status === 'entered') {
      // 已进入（会话进行中）→ 恢复对应面板
      if (en.kind === 'cultivate') await useCultivationStore().resume()
      else await useDungeonStore().resume()
    } else {
      // pending → 消耗奇遇进入；若进入失败（如正在修炼/副本中）则重开奇遇面板
      if (en.kind === 'cultivate') {
        await useCultivationStore().enterFromEncounter(id)
        if (!useCultivationStore().show) show.value = true
      } else {
        await useDungeonStore().enterFromEncounter(id)
        if (!useDungeonStore().showDungeon) show.value = true
      }
    }
    await fetch()
  }

  return { show, list, loading, fetch, open, close, abandon, enter }
})
