import { defineStore } from 'pinia'
import { ref } from 'vue'
import { checkEvent, applyEvent } from '../api'
import { usePlayerStore } from './player'
import { useBackpackStore } from './backpack'

/**
 * 场景事件状态机：
 * - tryTrigger：游戏动作(进入地点/突破/交任务)后调用，命中则开启对话
 * - pickChoice：玩家选选项 → 校验 require → 进入目标节点 → 落地 effect → 掷骰分支
 * - 节点类型：对话节点(npc+choices/end)、效果+掷骰节点(effects+roll，无台词)
 */
export const useRandomEventStore = defineStore('randomEvent', () => {
  const current = ref(null)      // { eventId, title } 或 null
  const nodes = ref({})          // { start, map }
  const messages = ref([])       // [{ from:'npc'|'player', text }]
  const choices = ref([])        // 当前可选 [{ text, require, goto }]
  const ended = ref(false)
  const checking = ref(false)    // 触发检测中（防重入）
  const busy = ref(false)        // 节点处理中（落地 effect/掷骰）

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

  /** 落地一批 effect：money 走 patchMoney，giveItem 刷新背包 */
  async function applyEffects(effects) {
    if (!effects?.length) return
    const playerStore = usePlayerStore()
    const backpackStore = useBackpackStore()
    try {
      const res = await applyEvent(playerStore.playerId, effects)
      if (res.data?.money != null) playerStore.patchMoney(res.data.money)
      await backpackStore.fetch()
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
    enterNode(nodes.value.start)
  }

  /** 触发检测：type=enter_location/breakthrough/deliver_task，payload 携带游戏状态 */
  async function tryTrigger(type, payload) {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId || current.value || checking.value) return
    checking.value = true
    try {
      const res = await checkEvent(playerStore.playerId, type, payload)
      if (res.data) start(res.data)
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
    messages.value.push({ from: 'player', text: choice.text })
    choices.value = []
    await enterNode(choice.goto)
  }

  function close() {
    current.value = null
    nodes.value = {}
    messages.value = []
    choices.value = []
    ended.value = false
  }

  return {
    current, nodes, messages, choices, ended, checking, busy,
    tryTrigger, pickChoice, canPick, close,
  }
})
