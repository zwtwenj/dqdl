/**
 * 极简全局事件总线（避免引入 mitt 依赖）。
 * 用于跨组件通信，如 request.js 拦截器触发 toast 提示。
 *
 * 用法：
 *   import { bus, BusEvents } from '@/utils/eventBus'
 *   bus.emit(BusEvents.TOAST, { type: 'error', message: '...' })
 *   bus.on(BusEvents.TOAST, handler)
 */
export const BusEvents = {
  /** 显示 toast 消息：{ type: 'success'|'error'|'info', message: string, duration?: number } */
  TOAST: 'toast',
}

const listeners = new Map()

export const bus = {
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(handler)
    return () => bus.off(event, handler)
  },
  off(event, handler) {
    listeners.get(event)?.delete(handler)
  },
  emit(event, payload) {
    listeners.get(event)?.forEach((h) => {
      try {
        h(payload)
      } catch (e) {
        console.error('事件处理出错:', e)
      }
    })
  },
}
