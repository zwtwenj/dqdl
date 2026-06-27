import { defineStore } from 'pinia'
import { ref } from 'vue'
import { talkToNpc, triggerNpcEvent } from '../api'
import { usePlayerStore } from './player'
import { useBackpackStore } from './backpack'
import { useTaskStore } from './task'

export const useDialogStore = defineStore('dialog', () => {
  // ── state ──
  const npc = ref(null)           // 当前对话 NPC
  const history = ref([])         // [{player, npc, taskCard?}]
  const loading = ref(false)

  // ── actions ──

  async function open(npcData) {
    npc.value = npcData
    history.value = []
    loading.value = true
    try {
      const res = await talkToNpc(npcData.id, '', [])
      history.value.push({ player: '', npc: res.data.reply || '...' })
    } catch {
      history.value.push({ player: '', npc: '（沉默地看了你一眼）' })
    }
    loading.value = false
  }

  function close() {
    npc.value = null
    history.value = []
  }

  async function send(message) {
    if (!npc.value || loading.value) return
    loading.value = true
    try {
      const res = await talkToNpc(npc.value.id, message, history.value)
      history.value.push({ player: message, npc: res.data.reply || '...' })
    } catch {
      history.value.push({ player: message, npc: '（对方没有回应）' })
    }
    loading.value = false
  }

  /**
   * 处理快捷对话事件：业务与台词统一由后端编排（POST /npc/:id/event），
   * 前端只负责把 npcReply 推进对话历史，再按 type 做对应的 UI 反应。
   */
  async function handleEvent(evt) {
    if (!npc.value) return
    const playerStore = usePlayerStore()
    const taskStore = useTaskStore()
    loading.value = true
    try {
      const res = await triggerNpcEvent(npc.value.id, evt.id, playerStore.playerId, history.value)
      const { type, npcReply, payload } = res.data || {}

      const entry = { player: evt.text, npc: npcReply || '...' }
      // 任务预览：附带任务卡，供玩家在对话内接受/拒绝
      if (type === 'createAdventurerTask' && payload?.taskCard) entry.taskCard = payload.taskCard
      history.value.push(entry)

      // 前端只做 UI 反应（不再决定调用哪个业务接口，也不再硬编码台词）
      if (type === 'completeTask') {
        await taskStore.fetch()
        // 交付会改变金币，刷新玩家数据
        const { getPlayer } = await import('../api')
        const pRes = await getPlayer(playerStore.playerId).catch(() => null)
        if (pRes) playerStore.data = pRes.data
      } else if (type === 'trade') {
        useBackpackStore().openTrade()
      } else if (type === 'cultivationRoom') {
        const { useCultivationRoomStore } = await import('./cultivationRoom')
        useCultivationRoomStore().open()
      }
    } catch (err) {
      history.value.push({ player: evt.text, npc: `（${err.response?.data?.message || err.message || '发生意外'}）` })
    } finally {
      loading.value = false
    }
  }

  return { npc, history, loading, open, close, send, handleEvent }
})
