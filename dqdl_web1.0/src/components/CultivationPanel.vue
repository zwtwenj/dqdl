<script setup>
/**
 * 洞天福地修炼面板（全屏遮罩，暗绿灵气风格）。
 *
 * 原子化触发：bus.on(CULTIVATION_OPEN, { encounterId }) 打开。
 * 打开时 enterCultivation 消耗奇遇建会话 → 开 EventSource 接 SSE 流
 * → 每 interval 收一条结算（gained/critical/capped）→ 达 max_rounds 后端推 stop 事件自动关闭。
 * 玩家可随时「停止修炼」（stopCultivation，后端结束会话）。
 *
 * SSE 断开（刷新/崩溃）：后端 abortActive 兜底回收会话+复位玩家空闲。
 * 修炼完成后 emit PLAYER_STATUS_CHANGE + PLAYER_UPDATE 让 GameView 刷新玩家数据。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { enterCultivation, stopCultivation, cultivationStreamUrl } from '../api'

const open = ref(false)
const loading = ref(false)
const stopping = ref(false)
const session = ref(null)        // 修炼会话 { star, rounds, max_rounds, interval }
const events = ref([])           // 结算日志 [{ gained, critical, capped, rounds }]
const errorMsg = ref('')

let es = null                    // EventSource 实例

const starText = computed(() => '★'.repeat(session.value?.star || 1))
const totalGained = computed(() => events.value.reduce((s, e) => s + (e.gained || 0), 0))
const curRounds = computed(() => session.value?.rounds || 0)
const maxRounds = computed(() => session.value?.max_rounds || 10)

/** 打开面板：进入修炼 + 开 SSE 流 */
async function handleOpen({ encounterId } = {}) {
  if (!encounterId) return
  open.value = true
  loading.value = true
  errorMsg.value = ''
  events.value = []
  try {
    session.value = await enterCultivation(encounterId)
    openStream()
  } catch (err) {
    errorMsg.value = err.message || '进入修炼失败'
  } finally {
    loading.value = false
  }
}

/** 开 SSE 流接收结算推送 */
function openStream() {
  closeStream()
  es = new EventSource(cultivationStreamUrl())

  // init 事件：确认 interval
  es.addEventListener('init', (e) => {
    try {
      const d = JSON.parse(e.data)
      if (session.value && d.interval) session.value.interval = d.interval
    } catch { /* ignore */ }
  })

  // 普通结算数据
  es.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data)
      events.value.push(d)
      if (session.value) {
        session.value.rounds = d.rounds
        session.value.total_gained = d.total_gained
      }
    } catch { /* ignore */ }
  }

  // stop 事件：修炼结束（自然完成 / 后端回收）
  es.addEventListener('stop', () => {
    finishCultivation()
  })

  es.onerror = () => {
    // EventSource 会自动重连，但若已 finished 则直接关闭
    // 不在这里 finish，等 stop 事件或手动关闭
  }
}

function closeStream() {
  if (es) {
    es.close()
    es = null
  }
}

/** 修炼结束：关流 + 通知 GameView 刷新玩家数据 + 关面板 */
function finishCultivation() {
  closeStream()
  // GameView 监听此事件会自动 loadPlayer() 刷新修为/状态
  bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
  open.value = false
  session.value = null
  events.value = []
}

/** 主动停止修炼 */
async function onStop() {
  if (stopping.value) return
  stopping.value = true
  try {
    await stopCultivation()
    bus.emit(BusEvents.TOAST, { type: 'info', message: '已停止修炼' })
    finishCultivation()
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '停止失败' })
  } finally {
    stopping.value = false
  }
}

/** ESC 关闭（修炼中按 ESC 视为停止） */
function onKeydown(e) {
  if (e.key === 'Escape' && open.value) onStop()
}

let offOpen = null
onMounted(() => {
  offOpen = bus.on(BusEvents.CULTIVATION_OPEN, handleOpen)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  offOpen && offOpen()
  closeStream()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="cv-overlay"
    >
      <div class="cv-box">
        <!-- 停止修炼按钮 -->
        <button
          class="cv-stop"
          type="button"
          :disabled="stopping"
          @click="onStop"
        >
          {{ stopping ? '停止中...' : '停止修炼' }}
        </button>

        <!-- 头部 -->
        <div class="cv-header">
          <div class="cv-scene">洞天福地 · {{ starText }}</div>
          <h2 class="cv-title">潜心修炼</h2>
          <div class="cv-progress">
            第 {{ curRounds }} / {{ maxRounds }} 轮 · 累计
            <span class="cv-total">+{{ totalGained }}</span> 修为
          </div>
        </div>

        <!-- 错误态 -->
        <div
          v-if="errorMsg"
          class="cv-empty"
        >
          {{ errorMsg }}
        </div>

        <!-- 加载/修炼区 -->
        <div
          v-else
          class="cv-body"
        >
          <div
            v-if="loading"
            class="cv-empty"
          >
            灵气汇聚中…
          </div>
          <div
            v-else-if="!events.length"
            class="cv-empty"
          >
            <span class="cv-spinner" />
            <span>吐纳调息中…</span>
          </div>
          <div
            v-else
            class="cv-list"
          >
            <div
              v-for="(ev, i) in events"
              :key="i"
              class="cv-entry"
              :class="{ 'cv-crit': ev.critical }"
            >
              <span class="cv-entry-gain">
                +{{ ev.gained }} 修为
                <template v-if="ev.critical"> · 暴击×3</template>
                <template v-if="ev.capped"> · 已达上限</template>
              </span>
              <span class="cv-entry-meta">第 {{ ev.rounds }}/{{ ev.max_rounds }} 轮</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cv-overlay {
  position: fixed;
  inset: 0;
  z-index: 240;
  background: radial-gradient(ellipse at center, rgba(20, 35, 30, 0.55), rgba(0, 0, 0, 0.92));
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cv-box {
  position: relative;
  width: 620px;
  max-width: 94vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  /* 背景图：修炼者盘坐。底色渐变兜底（图未加载时也有暗背景） */
  background:
    linear-gradient(180deg, rgba(8, 13, 11, 0.78), rgba(8, 13, 11, 0.92)),
    url('/player/cultivation.png') center center / cover no-repeat,
    linear-gradient(160deg, #0d1612 0%, #0a110e 60%, #080d0b 100%);
  border: 1px solid #4a3a22;
  border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(201, 168, 106, 0.15) inset, 0 0 50px rgba(40, 120, 100, 0.18);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.cv-stop {
  position: absolute;
  top: 14px;
  right: 16px;
  z-index: 5;
  padding: 5px 14px;
  font-size: 13px;
  letter-spacing: 2px;
  color: #e06060;
  background: rgba(40, 16, 16, 0.5);
  border: 1px solid #6a3030;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}
.cv-stop:hover:not(:disabled) {
  background: #3a2020;
  color: #f08080;
  border-color: #8a4040;
}
.cv-stop:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cv-header {
  padding: 26px 30px 16px;
  text-align: center;
  border-bottom: 1px solid #1d2e26;
}
.cv-scene {
  display: inline-block;
  padding: 2px 14px;
  font-size: 13px;
  letter-spacing: 3px;
  color: #6fbfa8;
  background: rgba(30, 74, 62, 0.4);
  border: 1px solid #2a5448;
  border-radius: 3px;
  margin-bottom: 10px;
}
.cv-title {
  margin: 0;
  font-size: 24px;
  font-weight: normal;
  letter-spacing: 8px;
  color: #d4af6a;
  text-shadow: 0 0 14px rgba(201, 168, 106, 0.35);
}
.cv-progress {
  margin-top: 12px;
  font-size: 13px;
  color: #6f8a80;
  letter-spacing: 1px;
}
.cv-total {
  color: #d4af6a;
  font-weight: bold;
}

.cv-body {
  flex: 1;
  min-height: 140px;
  overflow-y: auto;
  padding: 18px 24px 22px;
}
.cv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #5a6a60;
  font-size: 14px;
  letter-spacing: 2px;
  padding: 36px 0;
}
.cv-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid #2a5448;
  border-top-color: #6fbfa8;
  border-radius: 50%;
  animation: cv-spin 0.8s linear infinite;
}
@keyframes cv-spin {
  to { transform: rotate(360deg); }
}
.cv-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cv-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: rgba(20, 40, 34, 0.35);
  border: 1px solid #1e3a32;
  border-left: 3px solid #3e7a66;
  border-radius: 6px;
}
.cv-entry.cv-crit {
  border-left-color: #f0c040;
  background: rgba(60, 48, 20, 0.3);
}
.cv-entry-gain {
  color: #a0e0c0;
  font-size: 14px;
}
.cv-entry.cv-crit .cv-entry-gain {
  color: #f0d070;
}
.cv-entry-meta {
  color: #5a7a6e;
  font-size: 12px;
}
</style>
