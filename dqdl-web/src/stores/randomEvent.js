import { defineStore } from 'pinia'
import { ref } from 'vue'
import { checkEvent, applyEvent, syncEvent, getCurrentEvent } from '../api'
import { usePlayerStore } from './player'
import { useBackpackStore } from './backpack'
import { useTaskStore } from './task'
import { useOverlayStore } from './overlay'
import { Message } from '../utils/message'

/**
 * 场景事件状态机：
 * - tryTrigger：游戏动作(进入地点/突破/交任务)后调用，命中则开启对话
 * - pickChoice：玩家选选项 → 校验 require → 进入目标节点 → 落地 effect → 掷骰分支
 * - 节点类型：对话节点(npc+choices/end)、效果+掷骰节点(effects+roll，无台词)
 * 去重/触发记录由后端权威：once 事件在 random_event_log 查表去重；玩家过程(path)在 close 时回传。
 */
export const useRandomEventStore = defineStore('randomEvent', () => {
  const current = ref(null)      // { eventId, title } 或 null
  const nodes = ref({})          // { start, map }
  const messages = ref([])       // [{ from:'npc'|'player', text }]
  const choices = ref([])        // 当前可选 [{ text, require, goto }]
  const ended = ref(false)
  const checking = ref(false)    // 触发检测中（防重入）
  const busy = ref(false)        // 节点处理中（落地 effect/掷骰）
  const ctx = ref(null)          // 触发 payload（含 locationId 等，供 effect 落地使用）
  const path = ref([])           // 玩家过程：选项文本序列（close 时回传后端记录）
  const overlayZ = ref(0)        // 动态 z-index

  /** 加权随机选分支 */
  function pickWeighted(rolls) {
    const total = rolls.reduce((s, r) => s + (r.weight || 0), 0)
    let r = Math.random() * total
    for (const roll of rolls) {
      r -= (roll.weight || 0)
      if (r <= 0) return roll.goto
    }
    return rolls[rolls.length - 1].goto
  }

  /** 同步当前对话快照到后端事件总线(状态 started→in_progress，ended 收尾)。读取即捕获，发送异步不阻塞 UI。 */
  function sync(isEnd = false) {
    const playerStore = usePlayerStore()
    const eventId = current.value?.eventId
    if (!eventId || !playerStore.playerId) return
    const snapshot = {
      messages: messages.value,
      choices: choices.value,
      ended: !!(ended.value || isEnd),
      path: path.value,
      ctx: ctx.value,
    }
    syncEvent(playerStore.playerId, eventId, snapshot, isEnd).catch(() => { /* ignore */ })
  }

  /** 落地一批 effect：交后端 apply（money/giveItem/forgeTask/startBattle），按需刷新背包/任务。
   *  返回 { hasBattle, mobId }：若含 startBattle，调用方应暂停节点推进，等战斗回调。 */
  async function applyEffects(effects) {
    if (!effects?.length) return { hasBattle: false }
    const playerStore = usePlayerStore()
    const backpackStore = useBackpackStore()
    const hasForge = effects.some((e) => e && e.forgeTask)
    const hasBattleEff = effects.some((e) => e && e.startBattle)
    let mobId = null
    try {
      const res = await applyEvent(playerStore.playerId, effects, { locationId: ctx.value?.locationId })
      if (res.data?.money != null) playerStore.patchMoney(res.data.money)
      await backpackStore.fetch()
      if (hasForge) {
        await useTaskStore().fetch()
        Message.success('已接受锻造委托，查看任务面板了解详情')
      }
      // startBattle：后端建好 mob 并返回 mobId，前端据此打开战斗面板
      if (res.data?.battleMobId) mobId = res.data.battleMobId
    } catch (err) {
      console.error('事件效果落地失败', err)
    }
    return { hasBattle: !!mobId, mobId }
  }

  /** 进入一个节点：落地 effect → 掷骰 → 推入台词 */
  async function enterNode(nodeId) {
    const node = nodes.value.map?.[nodeId]
    if (!node) { ended.value = true; return }
    busy.value = true
    try {
      // 战斗节点特殊处理：落地 effect（含建 mob）后，若有 startBattle，暂停节点推进，
      // 打开战斗面板；战斗结束回调里按 win/lose/flee 跳转后续节点。
      if (node.effects?.length) {
        const r = await applyEffects(node.effects)
        if (r.hasBattle && r.mobId) {
          // 先推入战斗前的台词（若有），再开战
          if (node.npc != null) messages.value.push({ from: 'npc', text: node.npc })
          sync()
          const { useBattleStore } = await import('./battle')
          useBattleStore().open(r.mobId, (winner) => onBattleOver(nodeId, node, winner))
          return  // 暂停在此节点，等战斗回调
        }
      }
      if (node.roll?.length) {
        return await enterNode(pickWeighted(node.roll))
      }
      if (node.npc != null) messages.value.push({ from: 'npc', text: node.npc })
      choices.value = node.choices || []
      ended.value = !!node.end
      sync() // 持久化当前对话快照，供刷新恢复
    } finally {
      busy.value = false
    }
  }

  /** 战斗结束回调：按胜负跳转到节点配置的 win/lose/flee 目标节点；未配则结束事件。 */
  async function onBattleOver(nodeId, node, winner) {
    const gotoMap = { player: node.win, mob: node.lose, flee: node.flee }
    const target = gotoMap[winner]
    if (target && nodes.value.map?.[target]) {
      // 推入一句简短战果提示后进入下一节点（下一节点也可能是战斗，支持连战）
      const resultText = winner === 'player' ? '（你取得了胜利）' : (winner === 'flee' ? '（你逃离了战斗）' : '（你不敌落败）')
      messages.value.push({ from: 'system', text: resultText })
      await enterNode(target)
    } else {
      // 未配跳转目标：胜负即事件终点
      const resultText = winner === 'player' ? '你取得了胜利，事件了结。' : (winner === 'flee' ? '你逃离了战斗。' : '你不敌落败，事件就此结束。')
      messages.value.push({ from: 'system', text: resultText })
      ended.value = true
      choices.value = []
      sync(true)
    }
  }

  /** 开启事件对话 */
  function start(event) {
    nodes.value = event.nodes || {}
    current.value = { eventId: event.event_id, title: event.title || '事件' }
    messages.value = []
    choices.value = []
    ended.value = false
    path.value = []
    overlayZ.value = useOverlayStore().acquire('randomEvent')
    enterNode(nodes.value.start)
  }

  /** 触发检测：type=enter_location/breakthrough/deliver_task，payload 携带游戏状态(含 locationId) */
  async function tryTrigger(type, payload) {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId || current.value || checking.value) return
    checking.value = true
    try {
      const res = await checkEvent(playerStore.playerId, type, payload)
      if (res.data) {
        ctx.value = payload || null
        start(res.data)
      }
    } catch (err) {
      console.error('事件触发检测失败', err)
    } finally {
      checking.value = false
    }
  }

  /** 校验选项是否可选：require.money 等 */
  function canPick(choice) {
    const playerStore = usePlayerStore()
    if (choice.require?.money != null && playerStore.money < choice.require.money) {
      return { ok: false, reason: '金币不足' }
    }
    return { ok: true }
  }

  /** 玩家选择一个选项 */
  async function pickChoice(choice) {
    if (busy.value || ended.value) return
    if (!canPick(choice).ok) return
    path.value.push(choice.text) // 记录过程
    messages.value.push({ from: 'player', text: choice.text })
    choices.value = []
    await enterNode(choice.goto)
  }

  async function close() {
    // 关闭即收尾：将事件标记为 ended（不再恢复/不再触发）
    sync(true)
    current.value = null
    nodes.value = {}
    messages.value = []
    choices.value = []
    ended.value = false
    path.value = []
    useOverlayStore().release('randomEvent')
  }

  /** 从后端事件总线恢复进行中的事件（页面刷新后调用） */
  async function resumeInProgress() {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId || current.value) return
    try {
      const res = await getCurrentEvent(playerStore.playerId)
      const e = res.data
      if (!e || !e.event_id) return
      const s = e.snapshot || {}
      const hasSnapshot = Array.isArray(s.messages) && s.messages.length > 0
      if (!hasSnapshot) {
        // 快照为空（如 agent 编排的 immediate 事件刚入队、尚未被前端推进过）：
        // 走首次触发流程，从 start 节点开始落地 effects / 推入台词 / 设置选项。
        ctx.value = null
        start({ event_id: e.event_id, title: e.title, nodes: e.nodes })
        return
      }
      nodes.value = e.nodes || {}
      current.value = { eventId: e.event_id, title: e.title || '事件' }
      messages.value = s.messages || []
      choices.value = s.choices || []
      ended.value = !!s.ended
      path.value = s.path || []
      ctx.value = s.ctx || null
    } catch (err) {
      console.error('恢复进行中事件失败', err)
    }
  }

  return {
    current, nodes, messages, choices, ended, checking, busy, overlayZ,
    tryTrigger, pickChoice, canPick, close, resumeInProgress,
  }
})
