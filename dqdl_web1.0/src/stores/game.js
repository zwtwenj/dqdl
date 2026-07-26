import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const SAVE_KEY = 'dqdl_save'

/**
 * 游戏全局 store：存档、玩家 id、游戏状态。
 * 重构版：后端未接入前，存档读写走 localStorage 占位。
 */
export const useGameStore = defineStore('game', () => {
  const started = ref(false)
  // 初始化时从 localStorage 恢复 playerId，保证刷新页面不丢
  const playerId = ref(localStorage.getItem(SAVE_KEY) || null)

  /** 是否有存档（localStorage 占位，后端就绪后改为查后端） */
  const hasSave = computed(() => !!localStorage.getItem(SAVE_KEY))

  /** 设置当前 playerId 并持久化 */
  function setPlayerId(id) {
    playerId.value = id
    if (id == null) {
      localStorage.removeItem(SAVE_KEY)
    } else {
      localStorage.setItem(SAVE_KEY, String(id))
    }
  }

  /** 写入存档标记 */
  function writeSave(pid) {
    setPlayerId(pid)
  }

  /** 清除存档 */
  function clearSave() {
    setPlayerId(null)
    started.value = false
  }

  return { started, playerId, hasSave, setPlayerId, writeSave, clearSave }
})
