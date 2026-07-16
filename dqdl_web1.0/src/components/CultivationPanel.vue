<script setup>
/**
 * 统一修炼面板（合并洞天福地 + 修炼室，暗绿灵气风格）。
 *
 * 两类场景：
 *   - blessed（洞天福地）：奇遇驱动，bus.on(CULTIVATION_OPEN, {encounterId})，免费，按轮数结束。
 *   - room（修炼室）：    bus.on(CULTIVATION_ROOM_OPEN)，城内付费，玩家选档位+时长，按时长结束。
 *
 * 三态：
 *   - select  选档位+时长（仅 room；blessed 直接 enter）
 *   - live    实时修炼（SSE 结算推送）：仅显示 总修为 / 吐纳次数 / 已花金币(room) + 倒计时
 *   - summary 结算页（到期/停止/修满后）：展示本次汇总，确认后回到入口
 *
 * 关键行为（与后端统一修炼引擎对齐）：
 *   - 关闭弹窗(×) ≠ 停止修炼：只断 SSE + 隐藏面板，保留 session，status 仍 4(修炼中)。
 *     GameView 据 status==4 显示「修炼中」按钮，点击重新打开本面板 → resume 补发 + 重建 SSE。
 *   - 刷新页面：后端保留 active 会话，重连时 /stream 内部先 resume 按实际时间补发漏算。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import {
  getCultivationConfig,
  enterCultivation,
  getCurrentCultivation,
  getCultivationLatest,
  resumeCultivation,
  stopCultivation,
  cultivationStreamUrl,
} from '../api'

/** 面板视图态 */
const VIEW = { SELECT: 'select', LIVE: 'live', SUMMARY: 'summary' }

const open = ref(false)
const view = ref(VIEW.SELECT)
const scene = ref('room')        // 'blessed' | 'room'
const loading = ref(false)
const entering = ref(false)
const stopping = ref(false)
const config = ref(null)         // { interval, durations, minDuration, maxDuration, tiers:[{tier,name,cost,qi}] }
const session = ref(null)        // 当前/最近会话快照（含 scene/tier/rounds/total_gained/total_cost/planned_seconds/...）
const latest = computed(() => session.value) // 结算页用 session 末态
const errorMsg = ref('')
const endReason = ref(null)      // 本次结束原因

// 选档态：玩家选的档位 & 时长（分钟）
const pickedTier = ref(1)
const pickedDuration = ref(1)

let es = null                    // EventSource 实例
// 实时态的累计数据（SSE 推送），独立于 session 以便直接展示
const live = ref({ rounds: 0, total_gained: 0, total_cost: 0, money: 0, cultivation: 0, level_cultivation: 0, lastReason: null })
// 倒计时（room 用）
const remainSec = ref(0)
let countdownTimer = null

/* ============ 计算属性 ============ */
const isRoom = computed(() => scene.value === 'room')
const curTier = computed(() => config.value?.tiers?.find((t) => t.tier === session.value?.tier) || null)
const starText = computed(() => '★'.repeat(session.value?.tier || 1))
const sceneLabel = computed(() => (isRoom.value ? (curTier.value?.name || '修炼室') : `洞天福地 · ${starText.value}`))

const cultPct = computed(() => {
  const max = live.value.level_cultivation || session.value?.level_cultivation || 1
  const cur = live.value.cultivation || 0
  return Math.min(100, (cur / max) * 100)
})

/** 倒计时文本 */
const remainText = computed(() => {
  const s = Math.max(0, remainSec.value)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
})

/** 取某档位每轮金币（选档态预算用） */
function curTierCost(tier) {
  const t = config.value?.tiers?.find((x) => x.tier === tier)
  return t?.cost || 0
}

/** 结束原因 → 文案 */
const reasonText = computed(() => {
  const map = {
    full: '修为已满',
    timeout: '修炼时辰已到',
    rounds: '吐纳圆满',
    insufficient: '金币耗尽',
    stopped: '主动停止修炼',
    error: '修炼中断',
  }
  return endReason.value ? map[endReason.value] || endReason.value : ''
})

/* ============ 打开面板 ============ */

/** room 入口（CULTIVATION_ROOM_OPEN）：拉配置进选档态，或恢复进行中的会话 */
async function handleOpenRoom() {
  scene.value = 'room'
  errorMsg.value = ''
  open.value = true
  loading.value = true
  try {
    // 先看是否有进行中的修炼（玩家关闭弹窗/刷新后重新进入）
    const cur = await getCurrentCultivation()
    if (cur && cur.scene === 'room') {
      await resumeAndEnterLive(cur)
      return
    }
    config.value = await getCultivationConfig()
    pickedTier.value = config.value?.tiers?.[0]?.tier || 1
    pickedDuration.value = config.value?.durations?.[0] || 1
    view.value = VIEW.SELECT
  } catch (err) {
    errorMsg.value = err.message || '加载失败'
    view.value = VIEW.SELECT
  } finally {
    loading.value = false
  }
}

/** blessed 入口（CULTIVATION_OPEN, {encounterId}）：直接 enter 进实时态 */
async function handleOpenBlessed({ encounterId } = {}) {
  if (!encounterId) return
  scene.value = 'blessed'
  open.value = true
  loading.value = true
  errorMsg.value = ''
  try {
    const s = await enterCultivation({ scene: 'blessed', encounterId })
    session.value = s
    resetLive(s)
    startCountdown(s)
    view.value = VIEW.LIVE
    openStream()
  } catch (err) {
    errorMsg.value = err.message || '进入修炼失败'
    view.value = VIEW.SELECT
  } finally {
    loading.value = false
  }
}

/** 恢复进行中的会话（resume 补发 + 进实时态重建 SSE） */
async function resumeAndEnterLive(cur) {
  try {
    const r = await resumeCultivation()
    session.value = { ...cur, ...(r || {}) }
    resetLive({ ...cur, ...(r || {}) })
    startCountdown(cur)
    if (r?.finished) {
      // resume 时发现已到期 → 直接进结算页
      endReason.value = r.reason
      view.value = VIEW.SUMMARY
      bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
      return
    }
    view.value = VIEW.LIVE
    openStream()
  } catch (err) {
    errorMsg.value = err.message || '恢复修炼失败'
    view.value = VIEW.SELECT
  }
}

/* ============ 选档 → 进入修炼（room） ============ */
async function onEnterRoom() {
  if (entering.value) return
  entering.value = true
  errorMsg.value = ''
  try {
    const s = await enterCultivation({ scene: 'room', tier: pickedTier.value, duration: pickedDuration.value })
    session.value = s
    resetLive(s)
    startCountdown(s)
    view.value = VIEW.LIVE
    openStream()
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '进入修炼失败' })
  } finally {
    entering.value = false
  }
}

/* ============ SSE ============ */
function openStream() {
  closeStream()
  es = new EventSource(cultivationStreamUrl())
  es.addEventListener('init', (e) => {
    try {
      const d = JSON.parse(e.data)
      if (d.interval && session.value) session.value.interval = d.interval
    } catch { /* ignore */ }
  })
  // resume 事件：连接时后端补发漏算的汇总
  es.addEventListener('resume', (e) => {
    try {
      const d = JSON.parse(e.data)
      if (d.total_gained != null) live.value.total_gained = d.total_gained
      if (d.rounds != null) live.value.rounds = d.rounds
      if (d.total_cost != null) live.value.total_cost = d.total_cost
      if (d.money != null) live.value.money = d.money
      if (d.cultivation != null) live.value.cultivation = d.cultivation
      if (d.level_cultivation != null) live.value.level_cultivation = d.level_cultivation
    } catch { /* ignore */ }
  })
  // 普通结算数据
  es.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data)
      if (d.rounds != null) live.value.rounds = d.rounds
      if (d.total_gained != null) live.value.total_gained = d.total_gained
      if (d.total_cost != null) live.value.total_cost = d.total_cost
      if (d.money != null) live.value.money = d.money
      if (d.cultivation != null) live.value.cultivation = d.cultivation
      if (d.level_cultivation != null) live.value.level_cultivation = d.level_cultivation
      live.value.lastReason = d.reason
      if (session.value) {
        session.value.rounds = d.rounds
        session.value.total_gained = d.total_gained
        session.value.total_cost = d.total_cost
      }
    } catch { /* ignore */ }
  }
  // stop 事件：修炼结束 → 结算页
  es.addEventListener('stop', (e) => {
    let reason = live.value.lastReason
    try {
      const d = JSON.parse(e.data)
      if (d && d.reason) reason = d.reason
    } catch { /* ignore */ }
    onFinish(reason)
  })
  es.onerror = () => { /* EventSource 自动重连，等 stop 事件 */ }
}

function closeStream() {
  if (es) { es.close(); es = null }
}

/* ============ 结束 / 关闭 ============ */

/** SSE 收到 stop 或主动停止后：进结算页 */
function onFinish(reason) {
  closeStream()
  stopCountdown()
  endReason.value = reason || 'stopped'
  // 拉取最近会话汇总（确保 total 精确）
  fetchLatest()
  view.value = VIEW.SUMMARY
  bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
}

async function fetchLatest() {
  try {
    const s = await getCultivationLatest()
    if (s) session.value = s
  } catch { /* ignore */ }
}

/** 主动停止修炼 */
async function onStop() {
  if (stopping.value) return
  stopping.value = true
  try {
    const r = await stopCultivation()
    if (r?.session) session.value = r.session
    onFinish('stopped')
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '停止失败' })
  } finally {
    stopping.value = false
  }
}

/**
 * 关闭弹窗（×）——关键：不停止修炼，只断 SSE + 隐藏面板。
 * 后端保留 active 会话 + status=4，玩家可点「修炼中」按钮回来恢复。
 */
function close() {
  closeStream()
  stopCountdown()
  // 仅修炼中（live 态）才发状态变更以显示「修炼中」按钮；结算页关闭直接重置
  if (view.value === VIEW.LIVE) {
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
  }
  resetAll()
}

/** 结算页确认 → 回到入口态 */
function onSummaryConfirm() {
  resetAll()
  if (isRoom.value) {
    // 重新拉配置进选档态
    handleOpenRoom()
  } else {
    open.value = false
  }
}

function resetAll() {
  open.value = false
  view.value = VIEW.SELECT
  session.value = null
  endReason.value = null
  errorMsg.value = ''
  resetLive({})
  stopCountdown()
}

function resetLive(s) {
  live.value = {
    rounds: s?.rounds || 0,
    total_gained: s?.total_gained || 0,
    total_cost: s?.total_cost || 0,
    money: s?.money ?? 0,
    cultivation: s?.cultivation || 0,
    level_cultivation: s?.level_cultivation || 0,
    lastReason: s?.reason || null,
  }
}

/* ============ 倒计时（room） ============ */
function startCountdown(s) {
  stopCountdown()
  if (!s || s.scene !== 'room' || !s.planned_seconds) return
  const startMs = s.created_at ? new Date(s.created_at).getTime() : Date.now()
  const endMs = startMs + s.planned_seconds * 1000
  const tick = () => {
    remainSec.value = Math.max(0, Math.floor((endMs - Date.now()) / 1000))
    if (remainSec.value <= 0) stopCountdown()
  }
  tick()
  countdownTimer = setInterval(tick, 1000)
}
function stopCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}

/* ============ ESC 关闭（修炼中按 ESC = 关闭弹窗，不停止） ============ */
function onKeydown(e) {
  if (e.key === 'Escape' && open.value) close()
}

/* ============ 生命周期 ============ */
let offRoom = null
let offBlessed = null
onMounted(() => {
  offRoom = bus.on(BusEvents.CULTIVATION_ROOM_OPEN, handleOpenRoom)
  offBlessed = bus.on(BusEvents.CULTIVATION_OPEN, handleOpenBlessed)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  offRoom && offRoom()
  offBlessed && offBlessed()
  closeStream()
  stopCountdown()
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
        <!-- 右上：关闭按钮(×)；修炼态额外有停止按钮 -->
        <button
          class="cv-close"
          type="button"
          title="关闭（修炼继续在后台进行）"
          @click="close"
        >
          ×
        </button>
        <button
          v-if="view === 'live'"
          class="cv-stop"
          type="button"
          :disabled="stopping"
          @click="onStop"
        >
          {{ stopping ? '停止中...' : '停止修炼' }}
        </button>

        <!-- 错误态 -->
        <div
          v-if="errorMsg"
          class="cv-empty"
        >
          {{ errorMsg }}
        </div>

        <!-- 加载 -->
        <div
          v-else-if="loading"
          class="cv-empty"
        >
          <span class="cv-spinner" />
          <span>灵气汇聚中…</span>
        </div>

        <!-- ===== 选档态（仅 room） ===== -->
        <template v-else-if="view === 'select'">
          <div class="cv-header">
            <div class="cv-scene">修炼室</div>
            <h2 class="cv-title">
              选择修炼档位
            </h2>
          </div>
          <div class="cv-body">
            <div class="cv-tier-list">
              <div
                v-for="t in config?.tiers || []"
                :key="t.tier"
                class="cv-tier-card"
                :class="{ active: pickedTier === t.tier }"
                @click="pickedTier = t.tier"
              >
                <div class="cv-tier-name">
                  {{ t.name }}
                </div>
                <div class="cv-tier-meta">
                  斗气浓度 {{ t.qi }}
                </div>
                <div class="cv-tier-cost">
                  {{ t.cost }} 金币 / 次
                </div>
              </div>
            </div>

            <div class="cv-section-title">
              选择修炼时长
            </div>
            <div class="cv-dur-list">
              <button
                v-for="d in config?.durations || []"
                :key="d"
                type="button"
                class="cv-dur-btn"
                :class="{ active: pickedDuration === d }"
                @click="pickedDuration = d"
              >
                {{ d }}分钟
              </button>
            </div>

            <div class="cv-select-foot">
              <div class="cv-select-info">
                预计消耗 {{ curTierCost(pickedTier) * pickedDuration }} 金币
              </div>
              <button
                class="cv-enter-btn"
                type="button"
                :disabled="entering"
                @click="onEnterRoom"
              >
                {{ entering ? '进入中...' : '开始修炼' }}
              </button>
            </div>
          </div>
        </template>

        <!-- ===== 实时修炼态 ===== -->
        <template v-else-if="view === 'live'">
          <div class="cv-header">
            <div class="cv-scene">
              {{ sceneLabel }}
            </div>
            <h2 class="cv-title">
              潜心修炼
            </h2>
            <div class="cv-progress">
              <template v-if="isRoom">
                剩余 <span class="cv-total">{{ remainText }}</span>
              </template>
              <template v-else>
                第 {{ live.rounds }} / {{ session?.max_rounds || 10 }} 轮
              </template>
            </div>
          </div>
          <div class="cv-body">
            <!-- 大数字：本次总修为 -->
            <div class="cv-big">
              <div class="cv-big-label">
                本次获得修为
              </div>
              <div class="cv-big-val">
                +{{ live.total_gained }}
              </div>
            </div>

            <!-- 两小格：吐纳次数 / 已花金币(room) -->
            <div class="cv-stats">
              <div class="cv-stat">
                <em>{{ live.rounds }}</em>
                <span>吐纳次数</span>
              </div>
              <div
                v-if="isRoom"
                class="cv-stat"
              >
                <em class="is-cost">{{ live.total_cost }}</em>
                <span>已花金币</span>
              </div>
              <div
                v-else
                class="cv-stat"
              >
                <em>洞天</em>
                <span>免费修炼</span>
              </div>
            </div>

            <!-- 修为进度条 -->
            <div class="cv-cult">
              <div class="cv-cult-top">
                <span class="cv-cult-label">斗气修为</span>
                <span class="cv-cult-val">{{ live.cultivation }} / {{ live.level_cultivation }}</span>
              </div>
              <div class="cv-cult-bar">
                <div
                  class="cv-cult-fill"
                  :style="{ width: cultPct + '%' }"
                />
              </div>
            </div>

            <div class="cv-spin">
              <span class="cv-spinner-sm" />吐纳调息中…
            </div>
          </div>
        </template>

        <!-- ===== 结算页 ===== -->
        <template v-else-if="view === 'summary'">
          <div class="cv-header">
            <div class="cv-scene">
              {{ reasonText }}
            </div>
            <h2 class="cv-title">
              修炼结束
            </h2>
          </div>
          <div class="cv-body">
            <div class="cv-big">
              <div class="cv-big-label">
                本次获得修为
              </div>
              <div class="cv-big-val">
                +{{ session?.total_gained || 0 }}
              </div>
            </div>
            <div class="cv-stats">
              <div class="cv-stat">
                <em>{{ session?.rounds || 0 }}</em>
                <span>吐纳次数</span>
              </div>
              <div class="cv-stat">
                <em class="is-cost">{{ session?.total_cost || 0 }}</em>
                <span>消耗金币</span>
              </div>
            </div>
            <button
              class="cv-enter-btn"
              type="button"
              @click="onSummaryConfirm"
            >
              确认
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cv-overlay {
  position: fixed;
  width: 1200px;
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
  width: 560px;
  max-width: 94vw;
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  /* 三层背景：半透明蒙版 + 修炼者盘坐图 + 暗绿兜底（与洞天福地一致） */
  background:
    linear-gradient(180deg, rgba(8, 13, 11, 0.78), rgba(8, 13, 11, 0.92)),
    url('/player/cultivation.png') center center / cover no-repeat,
    linear-gradient(160deg, #0d1612 0%, #0a110e 60%, #080d0b 100%);
  border: 1px solid #4a3a22;
  border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(201, 168, 106, 0.15) inset, 0 0 50px rgba(40, 120, 100, 0.18);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.cv-close {
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 6;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 20px;
  line-height: 1;
  color: #c0b890;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #3a3a30;
  border-radius: 4px;
  cursor: pointer;
  font-family: serif;
}
.cv-close:hover {
  color: #ff9080;
  border-color: #6a3030;
}
.cv-stop {
  position: absolute;
  top: 14px;
  right: 50px;
  z-index: 5;
  padding: 5px 12px;
  font-size: 12px;
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
  min-height: 160px;
  overflow-y: auto;
  padding: 20px 28px 24px;
}
.cv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #5a6a60;
  font-size: 14px;
  letter-spacing: 2px;
  padding: 50px 0;
}
.cv-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid #2a5448;
  border-top-color: #6fbfa8;
  border-radius: 50%;
  animation: cv-spin 0.8s linear infinite;
}
.cv-spinner-sm {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid #2a5448;
  border-top-color: #6fbfa8;
  border-radius: 50%;
  animation: cv-spin 0.8s linear infinite;
  vertical-align: -2px;
}
@keyframes cv-spin {
  to { transform: rotate(360deg); }
}

/* 选档态 */
.cv-tier-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
.cv-tier-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 14px 8px;
  cursor: pointer;
  background: linear-gradient(180deg, rgba(20, 36, 30, 0.6), rgba(12, 22, 18, 0.7));
  border: 1px solid #2a5448;
  border-radius: 6px;
  text-align: center;
  transition: all 0.15s ease;
}
.cv-tier-card:hover {
  border-color: rgba(111, 191, 168, 0.7);
  transform: translateY(-2px);
}
.cv-tier-card.active {
  border-color: #6fbfa8;
  box-shadow: 0 0 12px rgba(111, 191, 168, 0.35);
}
.cv-tier-name {
  font-size: 14px;
  color: #a0e0c0;
  font-weight: 600;
  letter-spacing: 1px;
}
.cv-tier-meta {
  font-size: 11px;
  color: #5a8a7a;
}
.cv-tier-cost {
  font-size: 12px;
  color: #d4af6a;
}
.cv-section-title {
  font-size: 13px;
  color: #6f8a80;
  letter-spacing: 2px;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #1d2e26;
}
.cv-dur-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 22px;
}
.cv-dur-btn {
  padding: 6px 14px;
  font-size: 13px;
  color: #a0b0a8;
  background: rgba(20, 36, 30, 0.5);
  border: 1px solid #2a5448;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.cv-dur-btn:hover {
  border-color: rgba(111, 191, 168, 0.7);
}
.cv-dur-btn.active {
  color: #d4af6a;
  border-color: #d4af6a;
  background: rgba(60, 48, 20, 0.4);
}
.cv-select-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid #1d2e26;
}
.cv-select-info {
  font-size: 13px;
  color: #d4af6a;
}
.cv-enter-btn {
  padding: 9px 28px;
  font-size: 14px;
  letter-spacing: 3px;
  color: #0d1612;
  background: linear-gradient(180deg, #8fd8c0, #6fbfa8);
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}
.cv-enter-btn:hover:not(:disabled) {
  filter: brightness(1.1);
}
.cv-enter-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 实时修炼态 */
.cv-big {
  text-align: center;
  padding: 8px 0 18px;
}
.cv-big-label {
  font-size: 13px;
  color: #6f8a80;
  letter-spacing: 2px;
}
.cv-big-val {
  font-size: 38px;
  font-weight: 600;
  color: #d4af6a;
  text-shadow: 0 0 18px rgba(201, 168, 106, 0.4);
  letter-spacing: 2px;
}
.cv-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 18px;
}
.cv-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 4px;
  background: rgba(20, 36, 30, 0.45);
  border: 1px solid #1e3a32;
  border-radius: 5px;
}
.cv-stat em {
  font-style: normal;
  font-size: 18px;
  color: #a0e0c0;
  font-weight: 600;
}
.cv-stat .is-cost {
  color: #e08060;
}
.cv-stat span {
  font-size: 11px;
  color: #5a7a6e;
  letter-spacing: 1px;
}

.cv-cult {
  margin-bottom: 14px;
}
.cv-cult-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 6px;
}
.cv-cult-label {
  font-size: 12px;
  color: #5a7a6e;
  letter-spacing: 1px;
}
.cv-cult-val {
  font-size: 12px;
  color: #6fbfa8;
}
.cv-cult-bar {
  position: relative;
  width: 100%;
  height: 14px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(111, 191, 168, 0.3);
  border-radius: 7px;
  overflow: hidden;
}
.cv-cult-fill {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #3a8f78, #6fbfa8);
  transition: width 0.35s ease;
}

.cv-spin {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #5a7a6e;
  font-size: 13px;
  letter-spacing: 2px;
  padding: 6px 0;
}
</style>
