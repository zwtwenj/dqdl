/**
 * SSE 事件分发注册表。
 *
 * 通用 SSE 通道（GET /api/script/stream）会推送 {event, data}，
 * 这里按 event 名分发到对应 handler。后续多玩家聊天等其它推送也走这个通道。
 *
 * 新增事件只需在这里注册一个 handler：
 *   sseHandlers.chat_message = (data) => { ... }
 *
 * 设计参考 utils/dialogEventHandlers.js（同样是「事件字符串→handler」分发模式）。
 */
import { bus, BusEvents } from './eventBus'
import { getScriptNode } from '../api/script'

const sseHandlers = {
  /**
   * 剧本触发：后端选角+映射+移动NPC 全部完成后推送（status=playing）。
   * data 含 instance_id。前端拿 id 调接口获取当前节点信息（含映射 NPC），
   * 然后开始演出（演出窗口下轮接，本轮先 console + toast 验证链路）。
   */
  script_trigger: async (data) => {
    const instanceId = data?.instance_id
    if (!instanceId) {
      console.warn('script_trigger 缺 instance_id', data)
      return
    }
    try {
      const node = await getScriptNode(instanceId)
      console.log('🎬 剧本准备完成，当前节点信息：', node)
      // 通知剧本演出组件渲染（携带完整节点数据）
      bus.emit(BusEvents.SCRIPT_NODE_READY, { node })
    } catch (err) {
      console.error('获取剧本节点失败：', err)
    }
  },

  /**
   * 移动到达：后端 arrive 结算后推送（玩家 end_at 到期自动到达）。
   * data 含 { to_net_id, to_name }。emit PLAYER_MOVE_ARRIVED 通知：
   *   - playerStore.load() 刷新玩家状态（status 从 MOVING 恢复 IDLE）
   *   - mapView 监听后刷新地图视野 + 关闭移动弹窗
   * 前端不再需要靠倒计时到期主动调 arrive 接口。
   */
  move_arrived: (data) => {
    bus.emit(BusEvents.PLAYER_MOVE_ARRIVED, {
      to_net_id: data?.to_net_id,
      to_name: data?.to_name,
    })
  },
}

/**
 * 分发一个 SSE 事件。
 * @param {string} event 事件名
 * @param {any}    data  事件数据（已 JSON.parse）
 */
export function dispatchSseEvent(event, data) {
  const handler = sseHandlers[event]
  if (handler) {
    try {
      handler(data)
    } catch (e) {
      console.error(`SSE 事件处理出错 [${event}]:`, e)
    }
  } else {
    // 未知事件：打 warn，不阻断（便于调试）
    console.warn(`SSE 收到未注册的事件: ${event}`, data)
  }
}

/** 所有已注册的 event 名（供前端 EventSource.addEventListener 注册用）。 */
export const sseEventNames = Object.keys(sseHandlers)

