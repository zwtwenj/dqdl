import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 全局弹窗 z-index 中央调度。
 *
 * 每个弹窗用唯一 key 标识。open 时 acquire(key) 领一个递增 z-index（后开的更大→在上），
 * close 时 release(key) 出栈。z-index 只增不回收，简单可靠，避免释放后老弹窗层级回跳。
 *
 * 两段基准：
 *   modal 段：1000 起递增（角色/战斗/事件/副本等所有面板级弹窗）
 *   float 段：10000 起递增（tooltip/toast 永远在最上，但目前这两项用固定 token，未走本 store）
 *
 * 用法：
 *   const overlay = useOverlayStore()
 *   const z = overlay.acquire('battle')   // open 时
 *   overlay.release('battle')             // close 时
 *   模板 :style="{ zIndex: overlay.zOf('battle') }"
 */
export const useOverlayStore = defineStore('overlay', () => {
  const BASE_MODAL = 1000
  let counter = BASE_MODAL

  /** 当前打开的弹窗栈：[{ key, z }]。z 严格递增。 */
  const stack = ref([])

  /**
   * 登记/续租一个弹窗的 z-index。
   * 同 key 重复 acquire 会先释放旧的再分配新的（保证拿到更新的更高 z）。
   * @param key 弹窗唯一标识，如 'battle' / 'randomEvent' / 'role'
   * @returns 分配的 z-index（数字）
   */
  function acquire(key) {
    release(key)
    counter += 1
    stack.value = [...stack.value, { key, z: counter }]
    return counter
  }

  /** 释放弹窗（出栈）。z-index 不回收。 */
  function release(key) {
    stack.value = stack.value.filter(s => s.key !== key)
  }

  /** 查询某个 key 当前的 z-index；未登记返回 0 */
  function zOf(key) {
    return stack.value.find(s => s.key === key)?.z ?? 0
  }

  return { stack, acquire, release, zOf }
})
