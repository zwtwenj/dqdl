/**
 * 公共 UI 状态空间（挂在 window 上，不依赖 pinia）。
 *
 * 为什么不用 pinia store：confirm.js / dlg.vue 等可能在 pinia 实例挂载前
 * 或脱离组件上下文的地方需要取 z-index，直接用 window 更省事、无隐性强约束。
 *
 * 各弹窗组件/函数创建时调 nextZIndex() 取一个递增的 z-index，绑到最外层内联样式，
 * 保证「后创建的弹窗永远盖在先创建的之上」。计数从 100 起，页面刷新后重置回 100
 * （无副作用——玩家游玩极限也就到几百）。
 *
 * 用法（dlg.vue / confirm.js 等）：
 *   import { nextZIndex } from '@/stores/ui'
 *   const zIndex = nextZIndex()
 *   // 模板：<div :style="{ zIndex }">
 */

const KEY = '__dqdl_ui__'

function getSpace() {
  if (typeof window === 'undefined') return { dlgZIndex: 99 }
  if (!window[KEY]) {
    // 初值 99，nextZIndex 第一次返回 ++后的 100
    window[KEY] = { dlgZIndex: 99 }
  }
  return window[KEY]
}

/** 取下一个递增 z-index（100, 101, 102 ...）。 */
export function nextZIndex() {
  const space = getSpace()
  space.dlgZIndex += 1
  return space.dlgZIndex
}

/** 读取当前 z-index（不自增，调试用）。 */
export function getZIndex() {
  return getSpace().dlgZIndex
}
