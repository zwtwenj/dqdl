import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBackpack, sellItem, useItem, getPlayer } from '../api'
import { usePlayerStore } from './player'

export const useBackpackStore = defineStore('backpack', () => {
  // ── state（映射 backpack 表） ──
  const items = ref([])           // [{name, count, description, price}, ...]
  const showPanel = ref(false)
  const showTrade = ref(false)
  const tradeSelling = ref(false)
  const usingItem = ref(false)

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

  async function use(itemName) {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId || usingItem.value) return
    usingItem.value = true
    try {
      const res = await useItem(playerStore.playerId, itemName)
      if (res.data?.error) { alert(res.data.error); return }
      // 使用成功：刷新背包 + 同步玩家状态(hp/energy/buff/money)
      await fetch()
      if (res.data.player) playerStore.patch(res.data.player)
      if (res.data.used?.message) alert(res.data.used.message)
      return res.data
    } catch (err) {
      alert('使用失败: ' + (err.response?.data?.message || err.message))
    } finally {
      usingItem.value = false
    }
  }

  return {
    items, showPanel, showTrade, tradeSelling, usingItem,
    fetch, toggle, openTrade, closeTrade, sell, use,
  }
})
