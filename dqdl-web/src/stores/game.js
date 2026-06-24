import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getRoots, getChildren, doTraining as apiTraining } from '../api'
import { usePlayerStore } from './player'
import { useMapStore } from './map'
import { useBackpackStore } from './backpack'
import { useTaskStore } from './task'
import { startAutoTraining, stopAutoTraining } from '../services/trainingSession'

const SAVE_KEY = 'dqdl_save'

export const useGameStore = defineStore('game', () => {
  // ── state ──
  const started = ref(false)
  const trainingLog = ref([])
  const cultivationLog = ref([])
  const trainingLoading = ref(false)

  // ── 自动历练模式（SSE 连接由 services/trainingSession.js 持有）──
  const trainingMode = ref(false)
  const trainingEvents = ref([])
  const trainingInterval = ref(0)

  // ── 存档 ──
  function hasSave() {
    try { return !!JSON.parse(localStorage.getItem(SAVE_KEY))?.playerId }
    catch { return false }
  }
  function writeSave(playerId) {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ playerId }))
  }
  function clearSave() {
    localStorage.removeItem(SAVE_KEY)
  }
  function loadSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) }
    catch { return null }
  }

  // ── actions ──

  /** 新游戏：生成地图树 + 创建玩家 + 选出生城市 */
  async function newGame() {
    const playerStore = usePlayerStore()
    const mapStore = useMapStore()

    playerStore.loading = true
    clearSave()

    try {
      playerStore.loadingText = '天地初开...'
      const rootsRes = await getRoots()
      const roots = rootsRes.data
      if (!roots.length) throw new Error('没有根节点')
      const continent = roots[0]
      mapStore.breadcrumb = [{ ...continent, _children: roots }]

      playerStore.loadingText = '山川成形...'
      const regionsRes = await getChildren(continent.id)
      const regions = regionsRes.data
      mapStore.breadcrumb[0]._children = regions
      const region = regions[Math.floor(Math.random() * regions.length)]
      mapStore.breadcrumb.push({ ...region, _children: [] })

      playerStore.loadingText = '帝国崛起...'
      const empiresRes = await getChildren(region.id)
      const empires = empiresRes.data
      mapStore.breadcrumb[1]._children = empires
      const empire = empires[Math.floor(Math.random() * empires.length)]
      mapStore.breadcrumb.push({ ...empire, _children: [] })

      playerStore.loadingText = '城池显现...'
      const placesRes = await getChildren(empire.id)
      const places = placesRes.data
      mapStore.breadcrumb[2]._children = places
      const city = places.find(p => p.loc_type === 'city') || places[0]
      mapStore.breadcrumb.push({ ...city, _children: [] })

      playerStore.loadingText = '坊市开张...'
      const districtsRes = await getChildren(city.id)
      const districts = districtsRes.data
      mapStore.breadcrumb[3]._children = districts

      // 创建玩家
      await playerStore.newGame()

      // 同步初始位置到 DB
      const pos = mapStore.buildPositionStr()
      const { updatePlayerPosition } = await import('../api')
      updatePlayerPosition(playerStore.playerId, pos).catch(() => {})

      mapStore.currentLocation = city
      mapStore.currentChildren = districts

      writeSave(playerStore.playerId)
      started.value = true
    } finally {
      playerStore.loading = false
    }
  }

  /** 继续游戏：从 DB position 恢复位置 */
  async function continueGame() {
    const playerStore = usePlayerStore()
    const mapStore = useMapStore()
    const taskStore = useTaskStore()

    playerStore.loading = true
    const save = loadSave()
    if (!save?.playerId) {
      playerStore.loading = false
      alert('存档已损坏，请开始新游戏')
      return
    }

    try {
      await playerStore.loadPlayer(save.playerId)

      // 从 player.position（ID 数组 JSON）恢复位置
      const locId = playerStore.currentLocationId
      if (locId) {
        playerStore.loadingText = '载入地图...'
        await mapStore.loadLocationChain(locId)
      }

      writeSave(playerStore.playerId)
      await taskStore.fetch()
      started.value = true

      if (playerStore.data?.status === 2 && mapStore.currentLocation?.loc_type?.startsWith('wild')) {
        startAutoTraining()
      }
    } catch (err) {
      console.error('读档失败:', err)
      alert('读档失败: ' + (err.response?.data?.message || err.message))
    } finally {
      playerStore.loading = false
    }
  }

  /** 历练 */
  async function doTrainingEvent() {
    const playerStore = usePlayerStore()
    const mapStore = useMapStore()
    const backpackStore = useBackpackStore()
    const taskStore = useTaskStore()

    if (!playerStore.playerId || !mapStore.currentLocation?.id) return
    trainingLoading.value = true
    try {
      const res = await apiTraining(playerStore.playerId, mapStore.currentLocation.id)
      trainingLog.value.unshift(res.data)
      if (res.data.drops?.length > 0) await backpackStore.fetch()
      if (res.data.task_updates?.length > 0) await taskStore.fetch()
    } catch {
      trainingLog.value.unshift({ text: '历练中出现了意外...', mob: null, battle: null, drops: [], task_updates: [] })
    }
    trainingLoading.value = false
  }

  /** 修炼：玩家数据更新由 player store 负责，本 store 只负责 UI 日志 */
  async function doCultivate() {
    const playerStore = usePlayerStore()
    const mapStore = useMapStore()
    const qi = mapStore.currentLocation?.qi_density || 0
    if (!playerStore.playerId || qi <= 0) {
      cultivationLog.value.unshift({ text: '此地斗气稀薄，无法修炼', gained: 0, critical: false, capped: false })
      return
    }
    try {
      const d = await playerStore.cultivate(qi)
      let msg = '修炼完成！(+' + d.gained + ' 修为'
      if (d.critical) msg += '，暴击x3!'
      if (d.capped) msg += '，已达上限'
      msg += ')'
      cultivationLog.value.unshift({ text: msg, gained: d.gained, critical: d.critical, capped: d.capped })
    } catch (err) {
      cultivationLog.value.unshift({ text: '修炼失败: ' + (err.response?.data?.message || err.message), gained: 0, critical: false, capped: false })
    }
  }

  /** 突破：玩家数据更新由 player store 负责，本 store 只负责 UI 日志/提示 */
  async function doBreakthrough() {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId) return
    try {
      const d = await playerStore.breakthrough()
      cultivationLog.value.unshift({ text: d.narrative, gained: d.gained, critical: d.success, capped: !d.success })
      alert(d.narrative)
    } catch (err) {
      cultivationLog.value.unshift({ text: '突破失败: ' + (err.response?.data?.message || err.message), gained: 0, critical: false, capped: false })
    }
  }

  return {
    started, trainingLog, trainingLoading, cultivationLog,
    trainingMode, trainingEvents, trainingInterval,
    hasSave, writeSave, clearSave, loadSave,
    newGame, continueGame, doTrainingEvent, doCultivate, doBreakthrough,
    startAutoTraining, stopAutoTraining,
  }
})
