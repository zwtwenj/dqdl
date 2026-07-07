import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { usePlayerStore } from './player'
import { useBackpackStore } from './backpack'
import { useOverlayStore } from './overlay'
import { Message } from '../utils/message'
import { enterDungeon, getCurrentDungeon, nextDungeonAct, pickDungeonAct, useDungeonTempItem, escapeDungeon, failDungeon, lootDungeon, enterFromEncounter as enterFromEncounterApi } from '../api'

export const useDungeonStore = defineStore('dungeon', () => {
  const showDungeon = ref(false)
  const dungeonLoading = ref(false)   // 仅初始进入/生成时占位用
  const acting = ref(false)           // 操作中(下一幕/拾取/撤退)：只禁用按钮，不隐藏内容
  const instance = ref(null)

  // 动态 z-index：watch showDungeon 自动 acquire/release
  const overlayZ = ref(0)
  watch(showDungeon, v => {
    overlayZ.value = v ? useOverlayStore().acquire('dungeon') : (useOverlayStore().release('dungeon'), 0)
  })

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
  const isCompleted = computed(() => status.value === 'completed' || status.value === 'escaped' || status.value === 'failed')
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

  /** 从奇遇进入副本（消耗对应奇遇） */
  async function enterFromEncounter(encounterId) {
    showDungeon.value = true
    dungeonLoading.value = true
    instance.value = null
    const pid = playerStore.playerId
    try {
      const res = await enterFromEncounterApi(pid, encounterId)
      instance.value = res.data
    } catch (e) {
      instance.value = null
      showDungeon.value = false
      Message.error(e.response?.data?.message || '秘境凝聚失败，请重试')
    }
    dungeonLoading.value = false
  }

  /** 恢复（最小化后重新打开）：拉取当前进行中的副本 */
  async function resume() {
    showDungeon.value = true
    dungeonLoading.value = true
    instance.value = null
    const pid = playerStore.playerId
    try {
      const cur = await getCurrentDungeon(pid)
      instance.value = cur.data
    } catch {
      instance.value = null
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
      // 通关：临时背包已转入主背包，刷新主背包显示；后端已置 status=1，同步玩家状态
      if (res.data?.status === 'completed') {
        await useBackpackStore().fetch()
        await playerStore.refresh()
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
      await playerStore.refresh()  // 后端已置 status=1，同步玩家状态
    } catch (e) {
      // ignore
    }
    acting.value = false
  }

  /** 战斗失败：放弃副本，临时背包丢失 */
  async function fail() {
    if (acting.value) return
    acting.value = true
    const pid = playerStore.playerId
    try {
      const res = await failDungeon(pid)
      instance.value = res.data
      await playerStore.refresh()  // 后端已置 status=1，同步玩家状态
    } catch (e) {
      // ignore
    }
    acting.value = false
  }

  /** 战斗胜利掉落：掉落进临时背包，返回更新后的 instance */
  async function loot() {
    const pid = playerStore.playerId
    try {
      const res = await lootDungeon(pid)
      instance.value = res.data
      const act = res.data?.acts?.[res.data.current_act - 1]
      if (act?.lootNames?.length) Message.success('获得 ' + act.lootNames.join('、'))
      return res.data
    } catch (e) {
      return null
    }
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
    showDungeon, dungeonLoading, acting, instance, overlayZ,
    title, sceneType, difficulty, intro, acts, currentAct, status, totalActs,
    isLastAct, isCompleted, activeAct, tempItems,
    enter, enterFromEncounter, resume, next, escape, fail, loot, pick, useTemp, close,
  }
})
