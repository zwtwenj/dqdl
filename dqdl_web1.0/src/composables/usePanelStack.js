import { computed, ref } from 'vue'

/**
 * 弹窗层级管理（全局单例）。
 *
 * 设计：
 * - 用一个有序 id 数组 `stack` 表示从底到顶的层级顺序。
 * - 弹窗 mount 时 register（加入栈顶），unmount 时 unregister。
 * - 弹窗被打开/被点击（pointerdown）时调用 bringToFront(id)。
 * - z-index = 基础值 + 栈内位置，越靠栈顶越大。
 *
 * 关键：z 是 computed，依赖全局 stack。任一弹窗 focus 后，
 * 所有弹窗的 z 都会自动重算，永不出现"两个同 z"的脏状态。
 *
 * 多个弹窗共享同一份全局状态，所以用模块级 ref（单例）。
 */

/** 基础 z-index，弹窗至少从这里开始 */
const BASE_Z = 100
const stack = ref([])

/**
 * 注册弹窗（加入栈顶）。重复 register 同一 id 安全（幂等，移到栈顶）。
 * @param {string} id 弹窗唯一标识
 */
function register(id) {
  if (!stack.value.includes(id)) {
    stack.value.push(id)
  } else {
    bringToFront(id)
  }
}

/**
 * 注销弹窗（从栈中移除）。
 * @param {string} id
 */
function unregister(id) {
  stack.value = stack.value.filter((x) => x !== id)
}

/**
 * 将弹窗提到栈顶（最新打开 / 最近点击 者在上）。
 * @param {string} id
 */
function bringToFront(id) {
  if (!stack.value.includes(id)) {
    register(id)
    return
  }
  stack.value = [...stack.value.filter((x) => x !== id), id]
}

/**
 * 弹窗层级 hook。
 * @param {string} id 弹窗唯一标识（建议用 Symbol 或固定字符串）
 */
export function usePanelStack(id) {
  /** z-index：computed 依赖全局 stack，任一弹窗 focus 后自动重算 */
  const z = computed(() => {
    const idx = stack.value.indexOf(id)
    return idx === -1 ? BASE_Z : BASE_Z + idx + 1
  })

  function focus() {
    bringToFront(id)
  }
  function mount() {
    register(id)
  }
  function unmount() {
    unregister(id)
  }

  return { z, focus, mount, unmount }
}

export { stack as panelStack }
