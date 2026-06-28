import { defineStore } from 'pinia'
import { ref } from 'vue'
import { checkEvent, applyEvent, syncEvent, getCurrentEvent } from '../api'
import { usePlayerStore } from './player'
import { useBackpackStore } from './backpack'
import { useTaskStore } from './task'
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

  /** 落地一批 effect：交后端 apply（money/giveItem/forgeTask），按需刷新背包/任务 */
  async function applyEffects(effects) {
    if (!effects?.length) return
    const playerStore = usePlayerStore()
    const backpackStore = useBackpackStore()
    const hasForge = effects.some((e) => e && e.forgeTask)
    try {
      const res = await applyEvent(playerStore.playerId, effects, { locationId: ctx.value?.locationId })
      if (res.data?.money != null) playerStore.patchMoney(res.data.money)
      await backpackStore.fetch()
      if (hasForge) {
        await useTaskStore().fetch()
        Message.success('已接受锻造委托，查看任务面板了解详情')
      }
    } catch (err) {
      console.error('事件效果落地失败', err)
    }
  }

  /** 进入一个节点：落地 effect → 掷骰 → 推入台词 */
  async function enterNode(nodeId) {
    const node = nodes.value.map?.[nodeId]
    if (!node) { ended.value = true; return }
    busy.value = true
    try {
      if (node.effects?.length) await applyEffects(node.effects)
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

  /** 开启事件对话 */
  function start(event) {
    nodes.value = event.nodes || {}
    current.value = { eventId: event.event_id, title: event.title || '事件' }
    messages.value = []
    choices.value = []
    ended.value = false
    path.value = []
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
  }

  /** 从后端事件总线恢复进行中的事件（页面刷新后调用） */
  async function resumeInProgress() {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId || current.value) return
    try {
      const res = await getCurrentEvent(playerStore.playerId)
      const e = res.data
      if (!e || !e.event_id) return
      nodes.value = e.nodes || {}
      current.value = { eventId: e.event_id, title: e.title || '事件' }
      const s = e.snapshot || {}
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
    current, nodes, messages, choices, ended, checking, busy,
    tryTrigger, pickChoice, canPick, close, resumeInProgress,
  }
})
