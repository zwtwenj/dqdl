/**
 * dialog_event 前端回调库。
 *
 * 设计原则（一对一匹配）：
 *   每个 dialog_event.event 值对应一个 handler，key 与后端 dialog_event.event 字符串严格匹配。
 *   NpcDialog 点击快捷按钮时，按 evt.event 查本表分发，找不到则忽略（容错）。
 *
 * handler 职责边界（重要）：
 *   ✅ 只做 UI/store 操作（打开弹窗、emit 事件总线、切换本地状态）
 *   ❌ 不计算任何涉及数据库的数据（金额、库存、扣费等一律走后端接口）
 *
 * handler 接收上下文对象：
 *   { evt, npc, playerId, closeDialog }
 *   - evt:        dialog_event 原始对象 { id, text, event }
 *   - npc:        NPC 详情对象（含 id/name/role_id 等）
 *   - playerId:   当前玩家 id
 *   - closeDialog: 关闭对话弹窗的回调
 */

import { bus, BusEvents } from './eventBus'

/**
 * trade 事件：打开 NPC 商店 + 联动打开/置顶玩家背包。
 * 商品数据由 NpcShopPanel 自行调后端拉取（前端不计算价格/库存）。
 */
function handleTrade({ npc, playerId, closeDialog }) {
  bus.emit(BusEvents.NPC_SHOP_OPEN, { playerId, npcId: npc.id })
  // 联动打开玩家背包（GameView 监听 BAG_OPEN，打开并置顶）
  bus.emit(BusEvents.BAG_OPEN)
  closeDialog()
}

/**
 * createAdventurerTask 事件：打开「任务接取预览」面板。
 * 不直接接任务——面板里展示一个候选任务，玩家「接受/拒绝/换一个」。
 * 实际 DB 生成（preview 候选 / accept 入库）由 TaskAcceptPanel 自治处理。
 */
function handleCreateAdventurerTask({ playerId, closeDialog }) {
  if (!playerId) return
  bus.emit(BusEvents.TASK_ACCEPT_OPEN, { playerId })
  closeDialog?.()
}

/**
 * dialog_event 回调注册表。
 * key = dialog_event.event 字符串，value = handler 函数。
 * 新增事件类型时在此注册，保持与后端 dialog_event.event 一对一。
 */
export const dialogEventHandlers = {
  trade: handleTrade,
  createAdventurerTask: handleCreateAdventurerTask,
  // completeTask: handleCompleteTask,  // 交付任务事件后续接驳
}

/**
 * 按 event 名分发。
 * @returns {boolean} 是否命中已注册的 handler
 */
export function dispatchDialogEvent(eventName, ctx) {
  const handler = dialogEventHandlers[eventName]
  if (!handler) return false
  handler(ctx)
  return true
}
