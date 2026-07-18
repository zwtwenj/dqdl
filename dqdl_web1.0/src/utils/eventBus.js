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
  /** 登录失效：token 过期/被清，监听者应执行登出清理 */
  UNAUTHORIZED: 'unauthorized',
  /** 打开 NPC 对话：{ playerId: number, npcId: number }
   *  原子化触发——任何业务（点击 NPC 卡片 / 随机事件兜售 / 送信任务）只需 emit 这两个 id，
   *  对话 UI/状态/数据组装全部由全局挂载的 NpcDialog 自治处理。 */
  NPC_DIALOG_OPEN: 'npc-dialog-open',
  /** 打开 NPC 商店：{ playerId: number, npcId: number }
   *  原子化触发——对话弹窗内点「交易」快捷事件触发，商品 UI/查询由全局挂载的 NpcShopPanel 自治处理。 */
  NPC_SHOP_OPEN: 'npc-shop-open',
  /** 打开/置顶玩家背包（跨组件：全局组件触发，GameView 监听打开 bagOpen） */
  BAG_OPEN: 'bag-open',
  /** 玩家数据更新：{ player }
   *  丹药使用等动作改了 player 后端聚合数据，由动作发起方 emit 整个 player，
   *  GameView 监听后直接覆盖 player.value（无需重新拉接口）。 */
  PLAYER_UPDATE: 'player-update',
  /** 打开奇遇列表弹窗：无载荷（playerId 由弹窗自身从路由/全局拿） */
  ADVENTURE_OPEN: 'adventure-open',
  /** 发现奇遇通知（历练轮询拉到奇遇日志时触发）：{ title } 用于 Toast 提示 */
  ADVENTURE_FOUND: 'adventure-found',
  /** 打开秘境面板：{ encounterId? } 由奇遇详情「进入」触发，无 encounterId 则恢复/直接进入 */
  DUNGEON_OPEN: 'dungeon-open',
  /** 打开洞天福地修炼面板：{ encounterId } 由奇遇详情「进入」cultivate 类型触发 */
  CULTIVATION_OPEN: 'cultivation-open',
  /** 打开修炼室面板（城内付费修炼）：由修炼室管理员对话「我想要进行修炼」触发 */
  CULTIVATION_ROOM_OPEN: 'cultivation-room-open',
  /** 玩家状态变更（秘境进入/撤退等改变 status 时）：前端可监听刷新 player */
  PLAYER_STATUS_CHANGE: 'player-status-change',
  /** 打开「任务接取」预览面板：{ playerId }
   *  由公会接待员对话「我想要接取一些任务」触发；
   *  面板展示一个候选任务，玩家「接受/拒绝/换一个」，接受才入库。 */
  TASK_ACCEPT_OPEN: 'task-accept-open',
  /** 任务交付成功：{ taskId }
   *  由公会接待员对话「我完成了任务，来交付」交付后触发，
   *  TaskPanel 若打开着则刷新列表。 */
  TASK_CLAIM_UPDATE: 'task-claim-update',
  /** 打开 RPG 式分支对话弹窗：{ npc, scene }
   *  由进入场景钩子触发（如坊市且有动态演员）：纯预设剧本、节点+选项+goto 链式、
   *  显示最新节点台词不显示历史、玩家无输入只有选项。剧本暂为前端假数据，后续接分镜。 */
  SCENE_BRANCH_OPEN: 'scene-branch-open',
  /** 剧本节点准备就绪：{ node }
   *  由 SSE script_trigger handler 调完 getScriptNode 接口后 emit，
   *  携带完整节点数据（lines/choices/actors 等），SceneBranchDialog 接收并渲染演出。 */
  SCRIPT_NODE_READY: 'script-node-ready',
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
