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
   * 移动到达一段（多段移动的中间段，非全程）：后端 arrive 走完一段后推送。
   * data 含 { to_net_id, to_name }。emit PLAYER_MOVE_ARRIVED：
   *   mapView 监听后刷新地图 + 用新 session 重启下一段倒计时；playerStore 刷新玩家位置。
   */
  move_arrived: (data) => {
    bus.emit(BusEvents.PLAYER_MOVE_ARRIVED, {
      to_net_id: data?.to_net_id,
      to_name: data?.to_name,
    })
  },

  /** 移动全程结束（抵达 line 终点）：emit PLAYER_MOVE_FINISHED，mapView 关弹窗+刷新。 */
  move_finished: (data) => {
    bus.emit(BusEvents.PLAYER_MOVE_FINISHED, {
      to_net_id: data?.to_net_id,
      to_name: data?.to_name,
    })
  },

  /** 移动被取消：emit PLAYER_MOVE_CANCELLED，mapView 关弹窗 + 刷新到停留点。 */
  move_cancelled: (data) => {
    bus.emit(BusEvents.PLAYER_MOVE_CANCELLED, {
      stop_net_id: data?.stop_net_id,
    })
  },

  /**
   * 任务数据更新：后端在击杀计数命中/接受任务/放弃任务时推送。
   * emit TASK_UPDATE，任务列表组件监听后重新拉取。
   */
  task_update: () => {
    bus.emit(BusEvents.TASK_UPDATE)
  },

  /**
   * 历练新日志生成：后端每生成一条历练日志时推送。
   * data 含 { last_log_id }。emit TRAINING_LOG，information 监听后增量拉取。
   */
  training_log: (data) => {
    bus.emit(BusEvents.TRAINING_LOG, { last_log_id: data?.last_log_id })
  },

  /** 历练结束：后端历练到时/手动停止时推送。emit TRAINING_FINISHED。 */
  training_finished: () => {
    bus.emit(BusEvents.TRAINING_FINISHED)
  },

  /**
   * 修炼结算：后端修炼定时器每轮结算后推送。
   * data 为 SettleResult（gained/critical/rounds/total_gained/...）。emit CULTIVATION_SETTLE。
   */
  cultivation_settle: (data) => {
    bus.emit(BusEvents.CULTIVATION_SETTLE, data)
  },

  /** 修炼结束：后端修炼到期/修满/停止时推送。data 含 { reason }。emit CULTIVATION_FINISHED。 */
  cultivation_finished: (data) => {
    bus.emit(BusEvents.CULTIVATION_FINISHED, { reason: data?.reason })
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

