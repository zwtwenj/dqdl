import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useOverlayStore } from './overlay'

/**
 * 功法突破小游戏的状态：
 * - open(technique)：开启小游戏（technique 需含 id/name/level/rank/breakthrough_rate/max_level）
 * - result：后端结算结果 { success, narrative, ... }；非 null 时展示结算文案
 * - close：关闭（同时清空 result）
 */
export const useTechniqueBreakthroughStore = defineStore('techniqueBreakthrough', () => {
  const show = ref(false)
  const technique = ref(null)
  const result = ref(null)

  // 动态 z-index
  const overlayZ = ref(0)
  watch(show, v => {
    overlayZ.value = v ? useOverlayStore().acquire('techniqueBreakthrough') : (useOverlayStore().release('techniqueBreakthrough'), 0)
  })

  function open(t) {
    technique.value = t
    result.value = null
    show.value = true
  }
  function close() {
    show.value = false
    technique.value = null
    result.value = null
  }

  return { show, overlayZ, technique, result, open, close }
})
