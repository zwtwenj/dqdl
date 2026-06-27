import { cultivationRoomStreamUrl } from '../api'
import { useCultivationRoomStore } from '../stores/cultivationRoom'
import { usePlayerStore } from '../stores/player'

/**
 * 修炼室的 SSE 会话编排（仿 cultivationSession）。
 * 后端每 interval 结算一次（扣金币+涨修为），金币不足/修满/停止时推送 stop。
 * 断线自动重连：最多 MAX_RETRY 次；超过则停止（玩家可重开面板恢复）。
 */
let roomSSE = null
let roomCtx = null           // { pid }
let roomRetry = 0
let roomRetryTimer = null

const MAX_RETRY = 5
const RETRY_DELAY = 3000

function closeStream() {
  if (roomSSE) { roomSSE.close(); roomSSE = null }
}

function openStream() {
  const store = useCultivationRoomStore()
  const { pid } = roomCtx

  // 防御：若上一次连接未清理，先关闭，确保任意时刻只有一条 SSE
  if (roomSSE) { roomSSE.close(); roomSSE = null }
  roomSSE = new EventSource(cultivationRoomStreamUrl(pid))

  roomSSE.addEventListener('init', () => { /* interval 已知 */ })

  roomSSE.onmessage = (e) => {
    roomRetry = 0
    try {
      store.applySettle(JSON.parse(e.data))
    } catch { /* ignore */ }
  }

  // 后端自然结束（修满/金币不足/停止）：仅关连接，面板保留结算与原因
  roomSSE.addEventListener('stop', () => {
    closeStream()
  })

  roomSSE.onerror = () => {
    closeStream()
    if (roomRetry < MAX_RETRY) {
      roomRetry += 1
      roomRetryTimer = setTimeout(openStream, RETRY_DELAY)
    } else {
      closeStream()
    }
  }
}

export function startRoomStream() {
  const pid = usePlayerStore().playerId
  if (!pid) return
  // 幂等：若已有 SSE 连接则直接复用，绝不重复创建——
  // 多条 stream 会同时对同一会话结算，导致修炼倍速（×2）。
  if (roomSSE) return
  if (roomRetryTimer) { clearTimeout(roomRetryTimer); roomRetryTimer = null }
  roomCtx = { pid }
  roomRetry = 0
  openStream()
}

export function stopRoomStream() {
  if (roomRetryTimer) { clearTimeout(roomRetryTimer); roomRetryTimer = null }
  closeStream()
}
