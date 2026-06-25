import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePlayerStore } from './player'
import { useBackpackStore } from './backpack'
import { enterDungeon, getCurrentDungeon, nextDungeonAct, pickDungeonAct, useDungeonTempItem, escapeDungeon } from '../api'
import { Message } from '../utils/message'

export const useDungeonStore = defineStore('dungeon', () => {
  const showDungeon = ref(false)
  const dungeonLoading = ref(false)   // 仅初始进入/生成时占位用
  const acting = ref(false)           // 操作中(下一幕/拾取/撤退)：只禁用按钮，不隐藏内容
  const instance = ref(null)

  const playerStore = usePlayerStore()

  const title = computed(() => instance.value?.title || '')
  const sceneType = computed(() => instance.value?.scene_type || '')
  const difficulty = computed(() => instance.value?.difficulty || 1)
  const intro = computed(() => instance.value?.intro || '')
  const acts = computed(() => instance.value?.acts || [])
  const currentAct = computed(() => instance.value?.current_act || 1)
  const status = computed(() => instance.value?.status || 'active')
  const totalActs = computed(() => acts.value.length || 5)
  const isLastAct = computed(() => currentAct.value >= totalActs.value)
  const isCompleted = computed(() => status.value === 'completed' || status.value === 'escaped')
  const activeAct = computed(() => acts.value[currentAct.value - 1] || null)
  const tempItems = computed(() => instance.value?.temp_items || [])

  /** 打开副本面板：有进行中的则继续，否则生成新副本 */
  async function enter() {
    showDungeon.value = true
    dungeonLoading.value = true
    instance.value = null
    const pid = playerStore.playerId
    try {
      // 先查是否有进行中的副本
      const cur = await getCurrentDungeon(pid)
      instance.value = cur.data
    } catch {
      // 没有进行中的 → 生成新的
      try {
        const res = await enterDungeon(pid)
        instance.value = res.data
      } catch (e) {
        instance.value = null
      }
    }
    dungeonLoading.value = false
  }

  async function next() {
    if (acting.value || isCompleted.value) return
    acting.value = true
    const pid = playerStore.playerId
    try {
      const res = await nextDungeonAct(pid)
      instance.value = res.data
      // 通关：临时背包已转入主背包，刷新主背包显示
      if (res.data?.status === 'completed') {
        await useBackpackStore().fetch()
      }
    } catch (e) {
      // ignore
    }
    acting.value = false
  }

  async function escape() {
    if (acting.value) return
    acting.value = true
    const pid = playerStore.playerId
    try {
      const res = await escapeDungeon(pid)
      instance.value = res.data
    } catch (e) {
      // ignore
    }
    acting.value = false
  }

  /** 拾取当前物品幕奖励 */
  async function pick() {
    if (acting.value) return
    acting.value = true
    const pid = playerStore.playerId
    try {
      const res = await pickDungeonAct(pid)
      instance.value = res.data
    } catch (e) {
      // ignore
    }
    acting.value = false
  }

  /** 使用副本临时背包中的物品 */
  async function useTemp(name) {
    if (acting.value) return
    acting.value = true
    const pid = playerStore.playerId
    try {
      const res = await useDungeonTempItem(pid, name)
      if (res.data?.error) { Message.error(res.data.error); return }
      if (res.data.instance) instance.value = res.data.instance
      if (res.data.player) playerStore.patch(res.data.player)
      if (res.data.used?.message) Message.success(res.data.used.message)
    } catch (e) {
      Message.error('使用失败')
    }
    acting.value = false
  }

  function close() {
    showDungeon.value = false
    instance.value = null
  }

  return {
    showDungeon, dungeonLoading, acting, instance,
    title, sceneType, difficulty, intro, acts, currentAct, status, totalActs,
    isLastAct, isCompleted, activeAct, tempItems,
    enter, next, escape, pick, useTemp, close,
  }
})
