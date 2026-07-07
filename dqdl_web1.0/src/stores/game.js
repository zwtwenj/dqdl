import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const SAVE_KEY = 'dqdl_save'

/**
 * 游戏全局 store：存档、玩家 id、游戏状态。
 * 重构版：后端未接入前，存档读写走 localStorage 占位。
 */
export const useGameStore = defineStore('game', () => {
  const started = ref(false)
  const playerId = ref(null)

  /** 是否有存档（localStorage 占位，后端就绪后改为查后端） */
  const hasSave = computed(() => !!localStorage.getItem(SAVE_KEY))

  /** 写入存档标记 */
  function writeSave(pid) {
    localStorage.setItem(SAVE_KEY, String(pid))
    playerId.value = pid
  }

  /** 清除存档 */
  function clearSave() {
    localStorage.removeItem(SAVE_KEY)
    playerId.value = null
    started.value = false
  }

  return { started, playerId, hasSave, writeSave, clearSave }
})
