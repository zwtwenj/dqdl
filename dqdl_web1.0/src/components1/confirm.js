/**
 * 函数式确认弹窗。
 *
 * 用法：
 *   import { confirm } from '@/components1/confirm'
 *   const ok = await confirm({ title: '提示', content: '确定删除？' })
 *   if (ok) { ... }
 *
 * 实现：
 *   confirm() 往模块级响应式 confirmHolder 塞一个实例配置并返回 Promise；
 *   ConfirmBox 组件（App.vue 挂载一次）渲染 holder，点确定/取消时调 resolveConfirm
 *   结束 Promise 并清空 holder。
 *
 * 一次只显示一个确认框。若上一个未关闭就再调 confirm()，会强制结束上一个（resolve false）
 * 再显示新的——即「抢占」而非「排队」。通常不会并发，够用。
 */
import { ref } from 'vue'
import { nextZIndex } from '@/stores/ui'

/** 模块级响应式 holder：当前展示的确认实例（null = 不显示） */
export const confirmHolder = ref(null)

let pendingResolver = null

/**
 * 弹出确认框，返回 Promise<boolean>。
 * - 确定 → resolve(true)
 * - 取消 / 点遮罩 / 点关闭 → resolve(false)（同语义，调用方只判断真假）
 *
 * 不用 reject，避免调用方还要 try/catch；一律用 false 表示未确认。
 *
 * @param {Object} options
 * @param {string} [options.title='提示']
 * @param {string} [options.content='']      确认内容（纯文本）
 * @param {string} [options.okText='确定']
 * @param {string} [options.cancelText='取消']
 * @returns {Promise<boolean>}
 */
export function confirm(options = {}) {
  // 若已有确认框展示，先强制结束上一个（保守处理：通常不会并发）
  if (confirmHolder.value) {
    resolveConfirm(false)
  }
  return new Promise((resolve) => {
    pendingResolver = resolve
    // 取递增 z-index，存进 holder 供组件绑内联样式
    confirmHolder.value = {
      title: options.title || '提示',
      content: options.content ?? '',
      okText: options.okText || '确定',
      cancelText: options.cancelText || '取消',
      zIndex: nextZIndex(),
    }
  })
}

/** 结束当前确认框：resolve Promise + 清空 holder */
export function resolveConfirm(result) {
  if (pendingResolver) {
    const r = pendingResolver
    pendingResolver = null
    r(result)
  }
  confirmHolder.value = null
}
