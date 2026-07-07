import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { usePlayerStore } from './player'
import { useDungeonStore } from './dungeon'
import { useCultivationStore } from './cultivation'
import { useOverlayStore } from './overlay'
import { getEncounters, abandonEncounter } from '../api'
import { Message } from '../utils/message'

export const useEncounterStore = defineStore('encounter', () => {
  const show = ref(false)
  const list = ref([])
  const loading = ref(false)

  // 动态 z-index
  const overlayZ = ref(0)
  watch(show, v => {
    overlayZ.value = v ? useOverlayStore().acquire('encounter') : (useOverlayStore().release('encounter'), 0)
  })

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
    // 状态校验由后端权威判断：若正在历练/修炼/副本，后端 enter 会拒绝并返回具体原因。
    // 不再做前端的"自动停止历练"——把决定权交还玩家，避免时序 hack。
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
    await usePlayerStore().refresh()  // 进入会改变 status，同步快照
  }

  return { show, overlayZ, list, loading, fetch, open, close, abandon, enter }
})
