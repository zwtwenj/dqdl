import { startGather, stopGather, gatherStreamUrl } from '../api'
import { useGameStore } from '../stores/game'
import { usePlayerStore } from '../stores/player'
import { useMapStore } from '../stores/map'
import { useBackpackStore } from '../stores/backpack'
import { Message } from '../utils/message'

/**
 * 自动采集的 SSE 会话编排（结构与 trainingSession.js 一致）。
 * 每 tick（默认 10s）在野外地点采集一次草药。
 */
let gatherSSE = null
let gatherCtx = null
let gatherRetry = 0
let gatherRetryTimer = null

const MAX_RETRY = 5
const RETRY_DELAY = 3000

function closeStream() {
  if (gatherSSE) { gatherSSE.close(); gatherSSE = null }
}

function openStream() {
  const game = useGameStore()
  const backpack = useBackpackStore()
  const { pid, lid } = gatherCtx

  gatherSSE = new EventSource(gatherStreamUrl(pid, lid))

  gatherSSE.addEventListener('init', (e) => {
    try {
      const data = JSON.parse(e.data)
      game.gatherInterval = data.interval || 0
    } catch { /* ignore */ }
  })

  gatherSSE.onmessage = (e) => {
    gatherRetry = 0
    try {
      const data = JSON.parse(e.data)
      game.gatherEvents = [data, ...game.gatherEvents].slice(0, 50)
      if (data.drops?.length > 0) backpack.fetch()
    } catch { /* ignore */ }
  }

  gatherSSE.addEventListener('error', (e) => {
    try {
      const data = JSON.parse(e.data)
      game.gatherEvents = [{ text: data.message || '采集遇到意外...', drops: [] }, ...game.gatherEvents]
    } catch { /* ignore */ }
  })

  gatherSSE.addEventListener('stop', () => { stopAutoGather() })

  gatherSSE.onerror = () => {
    closeStream()
    if (gatherRetry < MAX_RETRY) {
      gatherRetry += 1
      game.gatherEvents = [
        { text: `感应中断，${RETRY_DELAY / 1000}秒后重连（第${gatherRetry}/${MAX_RETRY}次）...`, drops: [] },
        ...game.gatherEvents,
      ]
      gatherRetryTimer = setTimeout(openStream, RETRY_DELAY)
    } else {
      stopAutoGather()
    }
  }
}

export function startAutoGather() {
  const game = useGameStore()
  const player = usePlayerStore()
  const map = useMapStore()

  const pid = player.playerId
  const lid = map.currentLocation?.id
  if (!pid || !lid) return
  const status = player.data?.status
  if (status && status !== 1) {
    const label = { 2: '历练', 3: '奇遇副本', 4: '洞天福地修炼', 5: '修炼室修炼', 6: '采集' }[status] || '其它事务'
    Message.warning(`你正在进行${label}，无法开始采集`)
    return
  }

  game.gatherMode = true
  game.gatherEvents = []
  game.gatherLoading = true
  startGather(pid).catch(() => {})
  gatherCtx = { pid, lid }
  gatherRetry = 0
  openStream()
  game.gatherLoading = false
}

export function stopAutoGather() {
  const game = useGameStore()
  const player = usePlayerStore()
  if (gatherRetryTimer) { clearTimeout(gatherRetryTimer); gatherRetryTimer = null }
  closeStream()
  game.gatherMode = false
  game.gatherLoading = false
  if (player.playerId) stopGather(player.playerId).catch(() => {})
}

export function isAutoGathering() {
  return !!gatherSSE
}
