import { cultivationStreamUrl } from '../api'
import { useCultivationStore } from '../stores/cultivation'
import { usePlayerStore } from '../stores/player'
import { useEncounterStore } from '../stores/encounter'

/**
 * 洞天福地修炼的 SSE 会话编排（仿 trainingSession）。
 *
 * 后端每 CULTIVATION_INTERVAL（开发 10s）结算一次，推送修为变化；
 * 达到 max_rounds 或玩家停止时关闭。
 * 断线（onerror）自动重连：最多 MAX_RETRY 次，每次间隔 RETRY_DELAY；
 * 收到数据即重置重试计数；超过次数则停止重连（面板保留已结算记录，玩家可手动「回到修炼」恢复）。
 */
let cultSSE = null
let cultCtx = null           // { pid }
let cultRetry = 0
let cultRetryTimer = null

const MAX_RETRY = 5
const RETRY_DELAY = 3000

function closeStream() {
  if (cultSSE) { cultSSE.close(); cultSSE = null }
}

function openStream() {
  const cult = useCultivationStore()
  const player = usePlayerStore()
  const { pid } = cultCtx

  cultSSE = new EventSource(cultivationStreamUrl(pid))

  cultSSE.addEventListener('init', () => { /* interval 已知，无需处理 */ })

  cultSSE.onmessage = (e) => {
    cultRetry = 0 // 收到数据，重置重试计数
    try {
      const data = JSON.parse(e.data)
      if (cult.session) {
        cult.session.rounds = data.rounds
        cult.session.total_gained = data.total_gained
      }
      cult.events = [data, ...cult.events]
      // 同步玩家修为到角色面板
      if (player.data) {
        player.data = {
          ...player.data,
          cultivation: data.cultivation,
          level_cultivation: data.level_cultivation,
        }
      }
      // 修炼满轮自动结束：延迟关闭面板 + 刷新奇遇列表（entered→done，自动移除）
      if (data.finished) {
        setTimeout(() => {
          cult.finish()
          useEncounterStore().fetch()
        }, 1500)
      }
    } catch { /* ignore */ }
  }

  // 后端自然结束（满轮次）：仅关连接，保留面板显示结算
  cultSSE.addEventListener('stop', () => {
    closeStream()
  })

  // 网络层错误：断线自动重连
  cultSSE.onerror = () => {
    closeStream()
    if (cultRetry < MAX_RETRY) {
      cultRetry += 1
      cultRetryTimer = setTimeout(openStream, RETRY_DELAY)
    } else {
      // 超过重试，放弃自动重连；会话在后端仍 active，玩家可手动「回到修炼」恢复
      closeStream()
    }
  }
}

export function startCultivation() {
  const player = usePlayerStore()
  const pid = player.playerId
  if (!pid) return
  cultCtx = { pid }
  cultRetry = 0
  openStream()
}

/** 关闭 SSE 连接并取消挂起重连（store.stop / store.minimize 时调用） */
export function stopCultivation() {
  if (cultRetryTimer) { clearTimeout(cultRetryTimer); cultRetryTimer = null }
  closeStream()
}
