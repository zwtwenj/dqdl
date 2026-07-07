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
  // 状态校验由后端权威判断（assertIdle），前端只显示后端返回的具体原因，不做本地拦截

  game.gatherMode = true
  game.gatherEvents = []
  game.gatherLoading = true
  startGather(pid).then(async () => {
    // 开始成功：刷新玩家状态（确保前端 status 与后端一致）
    await player.refresh?.()
  }).catch(async (err) => {
    // 开始失败：回滚 UI + 显示后端错误信息 + 刷新状态
    game.gatherMode = false
    game.gatherLoading = false
    await player.refresh?.()
    const msg = err.response?.data?.message || err.message || '开始采集失败'
    Message.warning(msg)
  })
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
  // 停止后刷新前端 status，避免缓存旧状态导致再次开始时被误拒
  if (player.playerId) {
    stopGather(player.playerId).then(() => player.refresh?.()).catch(() => player.refresh?.())
  }
}

export function isAutoGathering() {
  return !!gatherSSE
}
