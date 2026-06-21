import { defineStore } from 'pinia'
import { ref } from 'vue'
import { talkToNpc, generateTask, acceptTask, completeAdventurerTasks } from '../api'
import { usePlayerStore } from './player'
import { useMapStore } from './map'
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

  /** 处理快捷对话事件 */
  async function handleEvent(evt) {
    if (!evt.event) { await send(evt.text); return }

    let eventData
    try { eventData = typeof evt.event === 'string' ? JSON.parse(evt.event) : evt.event }
    catch { await send(evt.text); return }

    const playerStore = usePlayerStore()
    const mapStore = useMapStore()
    const taskStore = useTaskStore()
    const backpackStore = useBackpackStore()

    if (eventData.type === 'createAdventurerTask') {
      taskStore.loading = true
      try {
        const res = await generateTask(mapStore.currentLocation?.id)
        const preview = res.data
        const t0 = preview.target?.[0] || {}
        history.value.push({
          player: evt.text,
          npc: '本公会有以下任务，你是否接受？',
          taskCard: {
            preview: true,
            description: preview.description,
            target: preview.target,
            reward: preview.reward,
            delivery: preview.delivery || null,
            star: preview.star || 1,
            location_path: t0.location_path || [],
            mob_name: t0.mob_name || '',
            kill_count: t0.kill_count || t0.required || 0,
            required: t0.required || 0,
            current: 0,
          },
        })
      } catch (err) {
        history.value.push({ player: evt.text, npc: `任务生成失败：${err.response?.data?.message || err.message}` })
      } finally { taskStore.loading = false }

    } else if (eventData.type === 'completeTask') {
      taskStore.loading = true
      try {
        const npcId = npc.value?.id
        const res = await completeAdventurerTasks(playerStore.playerId, npcId)
        const { count, tasks: doneTasks } = res.data
        if (count === 0) {
          history.value.push({ player: evt.text, npc: '目前没有可以交付的已完成任务。' })
        } else {
          const names = doneTasks.map(t => t.description).join('、')
          let totalMoney = 0
          for (const dt of doneTasks) {
            for (const r of dt.reward || []) {
              if (r.type === 'money' && r.value) totalMoney += r.value
            }
          }
          const moneyMsg = totalMoney > 0 ? ` 获得奖励 ${totalMoney} 金币！` : ''
          history.value.push({ player: evt.text, npc: `辛苦了！已为你登记以下 ${count} 个任务完成：${names}。${moneyMsg}` })
          await taskStore.fetch()
          // 刷新玩家数据
          if (playerStore.playerId) {
            const { getPlayer } = await import('../api')
            const pRes = await getPlayer(playerStore.playerId)
            playerStore.data = pRes.data
          }
        }
      } catch (err) {
        history.value.push({ player: evt.text, npc: `交付失败：${err.response?.data?.message || err.message}` })
      } finally { taskStore.loading = false }

    } else if (eventData.type === 'trade') {
      backpackStore.openTrade()
    } else {
      await send(evt.text)
    }
  }

  return { npc, history, loading, open, close, send, handleEvent }
})
