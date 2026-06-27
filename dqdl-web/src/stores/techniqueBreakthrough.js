import { defineStore } from 'pinia'
import { ref } from 'vue'

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

  return { show, technique, result, open, close }
})
