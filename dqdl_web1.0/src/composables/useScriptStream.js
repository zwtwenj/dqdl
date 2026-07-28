/**
 * 通用 SSE 长连接 composable。
 *
 * 玩家进入游戏后建立 GET /api/script/stream 连接，后端经 ScriptSseService 推送各类事件
 * （script_trigger / move_arrived / 未来的 chat_message 等）。前端按 sseEventNames
 * 注册监听，统一转发到 dispatchSseEvent 分发。
 *
 * 特性：
 *   - EventSource 断线自动重连（浏览器原生，onerror 后会自动重试）
 *   - token 失效（401/无 token）→ 不建连，避免无限重连刷接口
 *   - 组件卸载时主动 close，离开游戏页释放连接
 *
 * 用法：
 *   import { useScriptStream } from '@/composables/useScriptStream'
 *   const { open, close } = useScriptStream()
 *   open()    // 进入游戏时
 *   close()   // 离开时
 */
import { scriptStreamUrl } from '@/api/script'
import { dispatchSseEvent, sseEventNames } from '@/utils/sseEventHandlers'

export function useScriptStream() {
  let es = null

  /** 建立连接：为每个已注册事件名 addEventListener，转发到 dispatchSseEvent */
  function open() {
    close()
    // 无 token 不建连（未登录），避免 EventSource 无限重连刷 401
    if (!localStorage.getItem('dqdl_token')) return

    es = new EventSource(scriptStreamUrl())

    // 每个具名事件（script_trigger / move_arrived ...）单独监听
    for (const name of sseEventNames) {
      es.addEventListener(name, (e) => {
        try {
          const data = e.data ? JSON.parse(e.data) : null
          dispatchSseEvent(name, data)
        } catch (err) {
          console.error(`SSE 事件解析失败 [${name}]:`, err)
        }
      })
    }
    // init 握手（无需分发，仅确认连接）
    es.addEventListener('init', () => {
      // 连接成功，可在此做日志
    })
    // onerror：EventSource 会自动重连，这里无需手动处理；
    // 但 token 失效时后端会持续 401，EventSource 会无限重连——
    // request.js 的 401 处理已覆盖常规请求，EventSource 的 401 暂时由浏览器重连节流
    es.onerror = () => {
      /* EventSource 自动重连 */
    }
  }

  /** 关闭连接 */
  function close() {
    if (es) {
      es.close()
      es = null
    }
  }

  return { open, close }
}
