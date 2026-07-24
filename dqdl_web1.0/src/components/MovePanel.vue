<script setup>
/**
 * 移动弹窗（居中模态）：倒计时 + 中止。
 * 接收 session 数据（含 end_at / to_name / from_name / duration_sec）。
 * 倒计时基于 end_at（服务器时间戳），刷新后仍准确。
 * 到 0 自动调 arrive → emit PLAYER_UPDATE + 关闭。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { arriveMove, cancelMove } from '../api/move'

const props = defineProps({
  session: { type: Object, default: null },
})
const emit = defineEmits(['close', 'arrived'])

const remainSec = ref(0)
let timer = null
const cancelling = ref(false)
const showCancelConfirm = ref(false) // 中止二次确认

const remainText = computed(() => {
  const s = Math.max(0, remainSec.value)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
})

const progress = computed(() => {
  if (!props.session) return 0
  const total = props.session.duration_sec || 1
  const elapsed = total - remainSec.value
  return Math.min(100, Math.max(0, (elapsed / total) * 100))
})

function startTimer() {
  stopTimer()
  if (!props.session?.end_at) return
  const endMs = new Date(props.session.end_at).getTime()
  const tick = () => {
    remainSec.value = Math.max(0, Math.floor((endMs - Date.now()) / 1000))
    if (remainSec.value <= 0) {
      stopTimer()
      doArrive()
    }
  }
  tick()
  timer = setInterval(tick, 1000)
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

async function doArrive() {
  try {
    const res = await arriveMove()
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
    bus.emit(BusEvents.TOAST, { type: 'success', message: `已到达 ${props.session?.to_name || '目的地'}` })
    emit('arrived', res)
    emit('close')
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '到达失败' })
  }
}

/** 点中止 → 先弹二次确认 */
function onCancelClick() {
  if (cancelling.value) return
  showCancelConfirm.value = true
}

/** 确认中止 → 调后端 cancel */
async function doCancel() {
  showCancelConfirm.value = false
  if (cancelling.value) return
  cancelling.value = true
  try {
    await cancelMove()
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
    bus.emit(BusEvents.TOAST, { type: 'info', message: '已取消移动' })
    emit('close')
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '取消失败' })
  } finally {
    cancelling.value = false
  }
}

onMounted(startTimer)
onUnmounted(stopTimer)
</script>

<template>
  <Teleport to="body">
    <div class="move-overlay">
      <div class="move-box">
        <div class="move-header">
          🚶 正在前往
          <span class="move-dest">{{ session?.to_name || '...' }}</span>
        </div>

        <!-- 倒计时 -->
        <div class="move-timer">{{ remainText }}</div>

        <!-- 进度条 -->
        <div class="move-progress-bar">
          <div
            class="move-progress-fill"
            :style="{ width: progress + '%' }"
          />
        </div>

        <div class="move-info">
          从 {{ session?.from_name || '当前位置' }} 出发 · 速度 {{ session?.speed || '?' }}
        </div>

        <!-- 中止按钮 -->
        <button
          class="move-cancel-btn"
          type="button"
          :disabled="cancelling"
          @click="onCancelClick"
        >
          中止移动
        </button>

        <!-- 中止二次确认 -->
        <div
          v-if="showCancelConfirm"
          class="move-confirm-inline"
        >
          <span class="move-confirm-text">确定要中止移动吗？</span>
          <div class="move-confirm-actions">
            <button
              class="move-confirm-no"
              type="button"
              @click="showCancelConfirm = false"
            >继续移动</button>
            <button
              class="move-confirm-yes"
              type="button"
              :disabled="cancelling"
              @click="doCancel"
            >确认中止</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.move-overlay {
  position: fixed;
  width: 1200px;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 12, 0.7);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.move-box {
  width: 360px;
  padding: 28px 32px;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.97), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-align: center;
}
.move-header {
  font-size: 16px;
  color: rgba(200, 170, 110, 0.7);
  letter-spacing: 2px;
  margin-bottom: 16px;
}
.move-dest {
  color: #e8d5a0;
  font-size: 18px;
  font-weight: bold;
}
.move-timer {
  font-size: 48px;
  font-weight: bold;
  color: #e8d5a0;
  letter-spacing: 4px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
  margin-bottom: 16px;
}
.move-progress-bar {
  width: 100%;
  height: 6px;
  background: rgba(40, 30, 18, 0.6);
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 12px;
}
.move-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgba(180, 150, 90, 0.6), rgba(220, 190, 120, 0.9));
  border-radius: 3px;
  transition: width 1s linear;
}
.move-info {
  font-size: 12px;
  color: rgba(160, 140, 110, 0.5);
  margin-bottom: 20px;
}
.move-cancel-btn {
  padding: 8px 24px;
  border: 1px solid rgba(150, 120, 70, 0.4);
  background: rgba(40, 30, 18, 0.6);
  color: rgba(220, 200, 160, 0.7);
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s ease;
}
.move-cancel-btn:hover:not(:disabled) {
  background: rgba(120, 40, 30, 0.3);
  border-color: rgba(200, 80, 60, 0.5);
  color: #e8a0a0;
}
.move-cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 中止二次确认（弹窗内内联） */
.move-confirm-inline {
  margin-top: 12px;
  padding: 12px;
  background: rgba(60, 20, 15, 0.4);
  border: 1px solid rgba(200, 80, 60, 0.3);
  border-radius: 6px;
  text-align: center;
}
.move-confirm-text {
  font-size: 13px;
  color: rgba(220, 180, 160, 0.8);
  margin-bottom: 10px;
  display: block;
}
.move-confirm-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}
.move-confirm-no,
.move-confirm-yes {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.move-confirm-no {
  border: 1px solid rgba(150, 120, 70, 0.4);
  background: rgba(40, 30, 18, 0.6);
  color: rgba(200, 180, 150, 0.7);
}
.move-confirm-no:hover {
  background: rgba(60, 40, 20, 0.7);
}
.move-confirm-yes {
  border: 1px solid rgba(200, 80, 60, 0.5);
  background: rgba(80, 30, 20, 0.5);
  color: #e8a0a0;
}
.move-confirm-yes:hover:not(:disabled) {
  background: rgba(120, 40, 25, 0.6);
}
.move-confirm-yes:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
