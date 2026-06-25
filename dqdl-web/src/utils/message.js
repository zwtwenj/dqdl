import { ref } from 'vue'

/**
 * 全局消息队列（ElMessage 风格：纯函数式调用，渲染交给 MessageToast 基础组件）。
 * 任何位置 `import { Message } from '@/utils/message'` 即可：
 *   Message.success('使用成功') / Message.error('失败') / Message.info(...) / Message.warning(...)
 * 消息自动定时移除；点击消息可提前关闭。
 */
const messages = ref([])
let _seq = 0

function push(text, type = 'info', duration = 2800) {
  const id = ++_seq
  messages.value.push({ id, text: String(text ?? ''), type })
  if (duration > 0) setTimeout(() => remove(id), duration)
  return id
}

function remove(id) {
  const i = messages.value.findIndex((m) => m.id === id)
  if (i > -1) messages.value.splice(i, 1)
}

function clear() {
  messages.value.splice(0, messages.value.length)
}

export const messagesRef = messages

export const Message = {
  info: (text, d) => push(text, 'info', d),
  success: (text, d) => push(text, 'success', d),
  warning: (text, d) => push(text, 'warning', d),
  error: (text, d = 3600) => push(text, 'error', d),
  remove,
  clear,
}
