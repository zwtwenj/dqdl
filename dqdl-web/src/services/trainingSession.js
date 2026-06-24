import { setPlayerStatus, trainingStreamUrl } from '../api'
import { useGameStore } from '../stores/game'
import { usePlayerStore } from '../stores/player'
import { useMapStore } from '../stores/map'
import { useBackpackStore } from '../stores/backpack'
import { useTaskStore } from '../stores/task'

/**
 * 自动历练的 SSE 会话编排（阶段 2.2 从 game store 抽出）。
 *
 * 原本 game.js 持有模块级 trainingSSE 单例并直接改写 backpack/task store，
 * 既不可测试又把"网络连接生命周期"耦合进状态容器。
 * 这里把 SSE 的建立/事件解析/关闭集中到一处，store 只保留可见状态。
 */
let trainingSSE = null

export function startAutoTraining() {
  const game = useGameStore()
  const player = usePlayerStore()
  const map = useMapStore()
  const backpack = useBackpackStore()
  const task = useTaskStore()

  const pid = player.playerId
  const lid = map.currentLocation?.id
  if (!pid || !lid) return

  game.trainingMode = true
  game.trainingEvents = []
  game.trainingLoading = true
  setPlayerStatus(pid, 2).catch(() => {})

  const url = trainingStreamUrl(pid, lid)
  trainingSSE = new EventSource(url)

  trainingSSE.addEventListener('init', (e) => {
    try {
      const data = JSON.parse(e.data)
      game.trainingInterval = data.interval || 0
    } catch { /* ignore */ }
  })

  trainingSSE.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      game.trainingEvents = [data, ...game.trainingEvents]
      if (data.drops?.length > 0) backpack.fetch()
      if (data.task_updates?.length > 0) task.fetch()
    } catch { /* ignore */ }
  }

  trainingSSE.addEventListener('error', (e) => {
    try {
      const data = JSON.parse(e.data)
      game.trainingEvents = [{ text: data.message || '历练遇到意外...', mob: null, battle: null, drops: [], task_updates: [] }, ...game.trainingEvents]
    } catch { /* ignore */ }
  })

  trainingSSE.addEventListener('stop', () => {
    stopAutoTraining()
  })

  trainingSSE.onerror = () => {
    game.trainingEvents = [{ text: '与历练之地的感应中断了...', mob: null, battle: null, drops: [], task_updates: [] }, ...game.trainingEvents]
    stopAutoTraining()
  }

  game.trainingLoading = false
}

export function stopAutoTraining() {
  const game = useGameStore()
  const player = usePlayerStore()

  game.trainingMode = false
  game.trainingLoading = false
  setPlayerStatus(player.playerId, 1).catch(() => {})
  if (trainingSSE) {
    trainingSSE.close()
    trainingSSE = null
  }
}

export function isAutoTraining() {
  return !!trainingSSE
}
