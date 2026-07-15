<script setup>
/**
 * 任务接取预览面板（全局原子组件，App.vue 挂载一次）。
 *
 * 触发：bus.on(TASK_ACCEPT_OPEN, { playerId })，由公会接待员对话「我想要接取一些任务」触发。
 *
 * 流程（接受/拒绝/换一个）：
 *   打开 → previewAdventurerTask 拉一个候选（不入库）→ 展示
 *   「换一个」→ 重新 preview（不入库）
 *   「接受」 → acceptAdventurerTask 入库 → 关闭 + toast
 *   「拒绝」 → 关闭（不入库）
 *
 * 后端失败（无候选/已达上限）→ toast msg + 关闭面板。
 *
 * 全屏遮罩 + 居中暗金卡片，风格与 NpcDialog 一致。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { previewAdventurerTask, acceptAdventurerTask } from '../api/task'

const open = ref(false)
const playerId = ref(null)
const draft = ref(null)
const loading = ref(false)
const accepting = ref(false)

const STAR_LABEL = { 1: '一阶', 2: '二阶', 3: '三阶' }

/** 拉一个候选任务（不入库） */
async function loadPreview() {
  if (!playerId.value) return
  loading.value = true
  draft.value = null
  try {
    const res = await previewAdventurerTask(playerId.value)
    if (res?.ok && res.task) {
      draft.value = res.task
    } else {
      // 无候选 / 达上限：提示并关闭
      bus.emit(BusEvents.TOAST, { type: 'info', message: res?.msg || '无法接取任务' })
      open.value = false
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '生成任务失败' })
    open.value = false
  } finally {
    loading.value = false
  }
}

/** 接受候选任务（入库） */
async function onAccept() {
  if (!draft.value || accepting.value) return
  accepting.value = true
  try {
    const res = await acceptAdventurerTask(playerId.value, draft.value)
    if (res?.ok) {
      bus.emit(BusEvents.TOAST, { type: 'success', message: `已接受任务：${draft.value.description}` })
      open.value = false
      draft.value = null
    } else {
      bus.emit(BusEvents.TOAST, { type: 'info', message: res?.msg || '接受失败' })
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '接受任务失败' })
  } finally {
    accepting.value = false
  }
}

/** 换一个（重新预览，不入库） */
function onReroll() {
  if (loading.value) return
  loadPreview()
}

/** 拒绝（关闭，不入库） */
function onReject() {
  open.value = false
  draft.value = null
}

/** ESC 关闭 */
function onKeydown(e) {
  if (e.key === 'Escape' && open.value) onReject()
}

function handleOpen({ playerId: pid }) {
  playerId.value = pid
  open.value = true
  loadPreview()
}

let offOpen = null
onMounted(() => {
  offOpen = bus.on(BusEvents.TASK_ACCEPT_OPEN, handleOpen)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  offOpen && offOpen()
  window.removeEventListener('keydown', onKeydown)
})

function rewardText(reward) {
  if (!Array.isArray(reward) || !reward.length) return '无'
  return reward
    .map((r) => (r.type === 'money' && r.value ? `${r.value} 金币` : r.name ? `${r.name} ×${r.count || 1}` : ''))
    .filter(Boolean)
    .join('、')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="accept-overlay"
      @click.self="onReject"
    >
      <div class="accept-box">
        <!-- 标题 -->
        <div class="accept-header">
          <span class="accept-title">佣兵任务</span>
          <button
            class="accept-close"
            type="button"
            @click="onReject"
          >
            ×
          </button>
        </div>

        <!-- 候选内容 -->
        <div
          v-if="loading"
          class="accept-loading"
        >
          正在寻找合适的委托...
        </div>
        <div
          v-else-if="draft"
          class="accept-content"
        >
          <div class="draft-name">{{ draft.name }}</div>
          <div class="draft-star">{{ STAR_LABEL[draft.star] || '' }}委托</div>
          <div class="draft-desc">{{ draft.description }}</div>

          <!-- 目标 -->
          <div class="draft-section">
            <div class="section-label">委托目标</div>
            <div
              v-for="(tg, i) in draft.target"
              :key="i"
              class="target-line"
            >
              <span class="target-dot">◆</span>
              <span>{{ tg.desc }}</span>
              <span class="target-count">（{{ tg.required }} 只）</span>
            </div>
          </div>

          <!-- 奖励 -->
          <div class="draft-section">
            <div class="section-label">任务奖励</div>
            <div class="reward-line">{{ rewardText(draft.reward) }}</div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div
          v-if="draft && !loading"
          class="accept-actions"
        >
          <button
            class="btn btn-accept"
            type="button"
            :disabled="accepting"
            @click="onAccept"
          >
            {{ accepting ? '接受中...' : '接受' }}
          </button>
          <button
            class="btn btn-reroll"
            type="button"
            :disabled="accepting"
            @click="onReroll"
          >
            换一个
          </button>
          <button
            class="btn btn-reject"
            type="button"
            :disabled="accepting"
            @click="onReject"
          >
            拒绝
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.accept-overlay {
  position: fixed;
  width: 1200px;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 12, 0.75);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.accept-box {
  width: 460px;
  max-width: 90%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.96), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* header */
.accept-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: rgba(10, 8, 6, 0.6);
  border-bottom: 1px solid rgba(180, 150, 90, 0.25);
}
.accept-title {
  color: #f0d890;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 4px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.accept-close {
  background: none;
  border: 1px solid rgba(150, 120, 70, 0.4);
  color: rgba(200, 170, 110, 0.6);
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  font-size: 1.2rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.accept-close:hover {
  color: #ff9080;
  border-color: rgba(255, 120, 100, 0.6);
  background: rgba(60, 20, 15, 0.5);
}

/* 内容 */
.accept-loading {
  padding: 50px 16px;
  text-align: center;
  color: rgba(200, 170, 110, 0.6);
  letter-spacing: 2px;
}
.accept-content {
  padding: 18px 20px 14px;
}
.draft-name {
  font-size: 1.15rem;
  color: #f0d890;
  letter-spacing: 2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.draft-star {
  margin-top: 4px;
  font-size: 0.78rem;
  color: rgba(200, 170, 110, 0.7);
  letter-spacing: 1px;
}
.draft-desc {
  margin-top: 12px;
  padding: 10px 12px;
  font-size: 0.92rem;
  line-height: 1.7;
  color: #d4cca8;
  background: rgba(35, 28, 18, 0.5);
  border: 1px solid rgba(180, 150, 90, 0.15);
  border-radius: 6px;
  letter-spacing: 1px;
}
.draft-section {
  margin-top: 14px;
}
.section-label {
  font-size: 0.78rem;
  color: rgba(200, 170, 110, 0.6);
  letter-spacing: 2px;
  margin-bottom: 6px;
}
.target-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.88rem;
  color: #d8d0bc;
  letter-spacing: 1px;
  line-height: 1.8;
}
.target-dot {
  color: rgba(200, 170, 110, 0.7);
  font-size: 0.7rem;
}
.target-count {
  color: rgba(180, 150, 90, 0.6);
}
.reward-line {
  font-size: 0.95rem;
  color: #d4af6a;
  letter-spacing: 1px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}

/* 操作按钮 */
.accept-actions {
  display: flex;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid rgba(180, 150, 90, 0.18);
  background: rgba(10, 8, 6, 0.5);
}
.btn {
  flex: 1;
  padding: 9px 0;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-size: 0.95rem;
  letter-spacing: 3px;
  transition: all 0.15s ease;
}
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* 接受：金色调 */
.btn-accept {
  color: #f0d890;
  background: linear-gradient(180deg, rgba(70, 54, 30, 0.95), rgba(48, 36, 22, 0.95));
  border: 1px solid rgba(220, 190, 120, 0.6);
}
.btn-accept:hover:not(:disabled) {
  border-color: rgba(240, 216, 144, 0.95);
  box-shadow: 0 0 10px rgba(212, 175, 106, 0.3);
}
/* 换一个：中性 */
.btn-reroll {
  color: #b8c8d8;
  background: linear-gradient(180deg, rgba(40, 48, 58, 0.85), rgba(28, 34, 42, 0.85));
  border: 1px solid rgba(120, 140, 160, 0.45);
}
.btn-reroll:hover:not(:disabled) {
  border-color: rgba(160, 180, 200, 0.8);
}
/* 拒绝：暗红 */
.btn-reject {
  color: #d8a8a0;
  background: linear-gradient(180deg, rgba(58, 36, 34, 0.85), rgba(42, 26, 24, 0.85));
  border: 1px solid rgba(170, 100, 90, 0.45);
}
.btn-reject:hover:not(:disabled) {
  border-color: rgba(200, 120, 105, 0.8);
}
</style>
