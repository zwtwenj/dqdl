import { startTraining, stopTraining, trainingStreamUrl } from '../api'
import { useGameStore } from '../stores/game'
import { usePlayerStore } from '../stores/player'
import { useMapStore } from '../stores/map'
import { useBackpackStore } from '../stores/backpack'
import { useTaskStore } from '../stores/task'
import { useEncounterStore } from '../stores/encounter'
import { Message } from '../utils/message'

/**
 * 自动历练的 SSE 会话编排（阶段 2.2 从 game store 抽出）。
 *
 * 把 SSE 的建立/事件解析/关闭集中到一处，store 只保留可见状态。
 * 断线（onerror）自动重连：最多 MAX_RETRY 次，每次间隔 RETRY_DELAY；
 * 收到任意数据即重置重试计数；超过次数才真正停止历练。
 */
let trainingSSE = null
let trainingCtx = null        // { pid, lid }
let trainingRetry = 0
let trainingRetryTimer = null

const MAX_RETRY = 5
const RETRY_DELAY = 3000

function closeStream() {
  if (trainingSSE) { trainingSSE.close(); trainingSSE = null }
}

function openStream() {
  const game = useGameStore()
  const backpack = useBackpackStore()
  const task = useTaskStore()
  const encounter = useEncounterStore()
  const { pid, lid } = trainingCtx

  trainingSSE = new EventSource(trainingStreamUrl(pid, lid))

  trainingSSE.addEventListener('init', (e) => {
    try {
      const data = JSON.parse(e.data)
      game.trainingInterval = data.interval || 0
    } catch { /* ignore */ }
  })

  trainingSSE.onmessage = (e) => {
    trainingRetry = 0 // 收到数据，重置重试计数
    try {
      const data = JSON.parse(e.data)
      game.trainingEvents = [data, ...game.trainingEvents]
      if (data.drops?.length > 0) backpack.fetch()
      if (data.task_updates?.length > 0) task.fetch()
      if (data.encounter) {
        Message.success('✨ 发现奇遇：' + data.encounter.description)
        encounter.fetch()
      }
    } catch { /* ignore */ }
  }

  // 后端主动推送的业务错误（单个历练事件失败），仅记录，不重连
  trainingSSE.addEventListener('error', (e) => {
    try {
      const data = JSON.parse(e.data)
      game.trainingEvents = [{ text: data.message || '历练遇到意外...', mob: null, battle: null, drops: [], task_updates: [] }, ...game.trainingEvents]
    } catch { /* ignore */ }
  })

  trainingSSE.addEventListener('stop', () => {
    stopAutoTraining()
  })

  // 网络层错误：断线自动重连
  trainingSSE.onerror = () => {
    closeStream()
    if (trainingRetry < MAX_RETRY) {
      trainingRetry += 1
      game.trainingEvents = [
        { text: `感应中断，${RETRY_DELAY / 1000}秒后重连（第${trainingRetry}/${MAX_RETRY}次）...`, mob: null, battle: null, drops: [], task_updates: [] },
        ...game.trainingEvents,
      ]
      trainingRetryTimer = setTimeout(openStream, RETRY_DELAY)
    } else {
      game.trainingEvents = [{ text: '与历练之地的感应彻底中断，已停止历练。', mob: null, battle: null, drops: [], task_updates: [] }, ...game.trainingEvents]
      stopAutoTraining()
    }
  }
}

export function startAutoTraining() {
  const game = useGameStore()
  const player = usePlayerStore()
  const map = useMapStore()

  const pid = player.playerId
  const lid = map.currentLocation?.id
  if (!pid || !lid) return
  // 互斥：副本/修炼中等（status≠1）不允许开始历练，并给出原因提示
  const status = player.data?.status
  if (status && status !== 1) {
    const label = { 2: '历练', 3: '奇遇副本', 4: '洞天福地修炼', 5: '修炼室修炼' }[status] || '其它事务'
    Message.warning(`你正在进行${label}，无法开始历练`)
    return
  }

  game.trainingMode = true
  game.trainingEvents = []
  game.trainingLoading = true
  // 状态由后端统一管理：请求开始历练接口（后端校验并置 status=2）
  startTraining(pid).catch(() => {})

  trainingCtx = { pid, lid }
  trainingRetry = 0
  openStream()

  game.trainingLoading = false
}

export function stopAutoTraining() {
  const game = useGameStore()
  const player = usePlayerStore()

  if (trainingRetryTimer) { clearTimeout(trainingRetryTimer); trainingRetryTimer = null }
  closeStream()

  game.trainingMode = false
  game.trainingLoading = false
  // 请求后端停止历练（后端恢复 status=1），不再由前端直接改 status
  if (player.playerId) stopTraining(player.playerId).catch(() => {})
}

export function isAutoTraining() {
  return !!trainingSSE
}
