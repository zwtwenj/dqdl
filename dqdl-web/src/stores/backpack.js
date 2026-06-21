import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBackpack, sellItem, getPlayer } from '../api'
import { usePlayerStore } from './player'

export const useBackpackStore = defineStore('backpack', () => {
  // ── state（映射 backpack 表） ──
  const items = ref([])           // [{name, count, description, price}, ...]
  const showPanel = ref(false)
  const showTrade = ref(false)
  const tradeSelling = ref(false)

  // ── actions ──

  async function fetch() {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId) return
    try {
      const res = await getBackpack(playerStore.playerId)
      items.value = res.data?.items || []
    } catch { items.value = [] }
  }

  function toggle() {
    showPanel.value = !showPanel.value
    if (showPanel.value) fetch()
  }

  function openTrade() {
    showTrade.value = true
    fetch()
  }
  function closeTrade() { showTrade.value = false }

  async function sell(itemName, count) {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId || tradeSelling.value) return
    tradeSelling.value = true
    try {
      const res = await sellItem(playerStore.playerId, itemName, count)
      if (res.data?.error) { alert(res.data.error); return }
      await fetch()
      if (res.data.money != null) {
        playerStore.patchMoney(res.data.money)
      }
      return res.data
    } catch (err) {
      alert('出售失败: ' + (err.response?.data?.message || err.message))
    } finally {
      tradeSelling.value = false
    }
  }

  return {
    items, showPanel, showTrade, tradeSelling,
    fetch, toggle, openTrade, closeTrade, sell,
  }
})
