<script setup>
/**
 * 任务面板弹窗：右下角功能栏"任务"图标触发。
 *
 * 布局（左-右 1:3，右侧上-下 2:1）：
 *   ┌──────┬────────────────────────────┐
 *   │ 任务 │   任务详情（描述/目标/进度）  │  上 占 2/3
 *   │ 列表 │                             │
 *   │  1:  ├────────────────────────────┤
 *   │      │   任务奖励（金币/物品）       │  下 占 1/3
 *   └──────┴────────────────────────────┘
 *
 * 数据：打开时调 getMyTasks 拉玩家进行中任务（pending）。
 * 列表项点击 → 右侧详情联动。交付按钮调 claimTask。
 *
 * 暗金风格：深褐半透渐变 + 金边，与 CurrentMap/PlayerPanel 一致。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'
import { bus, BusEvents } from '../utils/eventBus'
import { getMyTasks, claimTask } from '../api/task'

const props = defineProps({
  modelValue: Boolean,
  playerId: { type: Number, default: null },
  pos: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:pos'])

/* ============ 弹窗层级 + 拖拽 ============ */
const { z, focus, mount, unmount } = usePanelStack('task')
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      mount()
      focus()
      loadTasks()
    } else {
      unmount()
    }
  },
)
onMounted(() => props.modelValue && mount())
onUnmounted(unmount)

const panelRef = ref(null)
const posModel = computed({
  get: () => props.pos,
  set: (v) => emit('update:pos', v),
})
const { dragging, onHandlePointerDown } = usePanelDraggable({
  elRef: panelRef,
  pos: posModel,
  onStart: focus,
})

/* ============ 数据 ============ */
const tasks = ref([])
const loading = ref(false)
const selectedId = ref(null)
const claiming = ref(false)

const selected = computed(
  () => tasks.value.find((t) => t.id === selectedId.value) || null,
)

/** 拉取玩家进行中任务 */
async function loadTasks() {
  if (!props.playerId) return
  loading.value = true
  try {
    const list = await getMyTasks(props.playerId)
    tasks.value = Array.isArray(list) ? list : []
    // 默认选中第一个
    if (tasks.value.length && !tasks.value.find((t) => t.id === selectedId.value)) {
      selectedId.value = tasks.value[0].id
    }
    if (!tasks.value.length) selectedId.value = null
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载任务失败' })
    tasks.value = []
  } finally {
    loading.value = false
  }
}

/** 选任务 */
function onSelect(task) {
  selectedId.value = task.id
  focus()
}

/** 判断任务是否可交付（所有目标达标） */
function canClaim(task) {
  if (!task?.target?.length) return false
  return task.target.every((t) => (t.current || 0) >= (t.required || 0))
}

/** 交付任务 */
async function onClaim(task) {
  if (claiming.value || !canClaim(task)) return
  claiming.value = true
  try {
    const res = await claimTask(task.id, props.playerId)
    bus.emit(BusEvents.TOAST, { type: 'success', message: `交付成功，获得 ${res.money} 金币` })
    await loadTasks()
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '交付失败' })
  } finally {
    claiming.value = false
  }
}

/** 星级渲染 */
const STAR_LABEL = { 1: '一阶', 2: '二阶', 3: '三阶' }
function starText(star) {
  return STAR_LABEL[star] || ''
}
function rewardText(reward) {
  if (!Array.isArray(reward) || !reward.length) return '无'
  return reward
    .map((r) => {
      if (r.type === 'money' && r.value) return `${r.value} 金币`
      if (r.name) return `${r.name} ×${r.count || 1}`
      return ''
    })
    .filter(Boolean)
    .join('、')
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <div
    v-if="modelValue"
    ref="panelRef"
    class="task-panel"
    :class="{ 'is-dragging': dragging }"
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
    @pointerdown="focus"
  >
    <!-- 顶部拖拽手柄 + 标题 -->
    <div
      class="panel-header drag-handle"
      title="拖拽移动"
      @pointerdown.stop="onHandlePointerDown"
    >
      <span class="panel-title">任务</span>
    </div>

    <!-- 关闭按钮 -->
    <button
      class="close-btn"
      type="button"
      title="关闭"
      @click="close"
    >
      ×
    </button>

    <!-- 主体：左列表 1 : 右详情 3 -->
    <div class="panel-body">
      <!-- 左：任务列表 -->
      <div class="task-list-col">
        <div
          v-if="loading && !tasks.length"
          class="empty-tip"
        >
          加载中...
        </div>
        <div
          v-else-if="!tasks.length"
          class="empty-tip"
        >
          暂无任务
        </div>
        <div
          v-for="t in tasks"
          :key="t.id"
          class="task-item"
          :class="{ active: t.id === selectedId }"
          @click="onSelect(t)"
        >
          <div class="task-item-name">{{ t.name }}</div>
          <div class="task-item-star">{{ starText(t.star) }}</div>
          <!-- 进度小条 -->
          <div
            v-if="t.target && t.target.length"
            class="task-item-progress"
          >
            {{ t.target[0].current || 0 }}/{{ t.target[0].required }}
          </div>
        </div>
      </div>

      <!-- 右：详情（上）+ 奖励（下），上下 2:1 -->
      <div class="task-detail-col">
        <template v-if="selected">
          <!-- 上：任务详情 -->
          <div class="detail-upper">
            <div class="detail-title">{{ selected.name }}</div>
            <div class="detail-desc">{{ selected.description }}</div>
            <!-- 目标进度 -->
            <div class="detail-targets">
              <div
                v-for="(tg, i) in selected.target"
                :key="i"
                class="target-row"
              >
                <span class="target-desc">{{ tg.desc }}</span>
                <div class="target-bar">
                  <div
                    class="target-bar-fill"
                    :style="{ width: Math.min(100, ((tg.current || 0) / Math.max(1, tg.required)) * 100) + '%' }"
                  />
                  <span class="target-bar-text">{{ tg.current || 0 }} / {{ tg.required }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 下：奖励 + 交付按钮 -->
          <div class="detail-lower">
            <div class="reward-label">任务奖励</div>
            <div class="reward-val">{{ rewardText(selected.reward) }}</div>
            <button
              class="claim-btn"
              type="button"
              :disabled="!canClaim(selected) || claiming"
              @click="onClaim(selected)"
            >
              {{ claiming ? '交付中...' : (canClaim(selected) ? '交付任务' : '未完成') }}
            </button>
          </div>
        </template>
        <div
          v-else
          class="empty-tip"
        >
          请从左侧选择任务
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.task-panel {
  position: absolute;
  right: 14px;
  bottom: 84px;
  width: 760px;
  height: 540px;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 16px;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.94), rgba(14, 11, 8, 0.96));
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.task-panel.is-dragging {
  user-select: none;
  -webkit-user-select: none;
}

/* 顶部标题栏（拖拽手柄） */
.panel-header {
  position: relative;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(180, 150, 90, 0.3);
  cursor: move;
  user-select: none;
  -webkit-user-select: none;
}
.panel-title {
  font-size: 15px;
  letter-spacing: 6px;
  color: #f0d890;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 3;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  color: rgba(220, 190, 120, 1);
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: serif;
}
.close-btn:hover {
  color: #ff9080;
  background: rgba(60, 20, 15, 0.5);
}

/* 主体：左 1 : 右 3 */
.panel-body {
  flex: 1;
  display: flex;
  gap: 12px;
  margin-top: 10px;
  min-height: 0;
}

/* 左：任务列表 */
.task-list-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  overflow-y: auto;
  background: rgba(8, 6, 4, 0.5);
  border: 1px solid rgba(120, 100, 60, 0.3);
  border-radius: 6px;
}
.task-item {
  position: relative;
  padding: 8px 10px;
  background: rgba(20, 16, 10, 0.7);
  border: 1px solid rgba(120, 100, 60, 0.25);
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
  &:hover {
    border-color: rgba(200, 170, 100, 0.55);
    background: rgba(30, 24, 14, 0.85);
  }
  &.active {
    border-color: rgba(220, 190, 120, 0.8);
    box-shadow: 0 0 8px rgba(200, 170, 100, 0.25);
    background: rgba(40, 32, 18, 0.9);
  }
}
.task-item-name {
  font-size: 13px;
  color: #e8d5a0;
  letter-spacing: 1px;
  line-height: 1.3;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
.task-item-star {
  margin-top: 2px;
  font-size: 10px;
  color: rgba(200, 170, 110, 0.7);
}
.task-item-progress {
  margin-top: 4px;
  font-size: 10px;
  color: #8fd17a;
  letter-spacing: 1px;
}

/* 右：详情列（上 2 : 下 1） */
.task-detail-col {
  flex: 3;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.detail-upper {
  flex: 2;
  display: flex;
  flex-direction: column;
  padding: 12px 14px;
  overflow-y: auto;
  background: rgba(8, 6, 4, 0.5);
  border: 1px solid rgba(120, 100, 60, 0.3);
  border-radius: 6px;
}
.detail-lower {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 14px;
  background: rgba(8, 6, 4, 0.5);
  border: 1px solid rgba(120, 100, 60, 0.3);
  border-radius: 6px;
}

.detail-title {
  font-size: 16px;
  color: #f0d890;
  letter-spacing: 2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  margin-bottom: 8px;
}
.detail-desc {
  font-size: 13px;
  line-height: 1.7;
  color: #d4cca8;
  letter-spacing: 1px;
  margin-bottom: 12px;
}
.detail-targets {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.target-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.target-desc {
  font-size: 12px;
  color: rgba(200, 180, 140, 0.85);
  letter-spacing: 1px;
}
.target-bar {
  position: relative;
  width: 100%;
  height: 18px;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(120, 100, 60, 0.35);
  border-radius: 3px;
  overflow: hidden;
}
.target-bar-fill {
  position: absolute;
  inset: 0;
  width: 0;
  background: linear-gradient(90deg, rgba(127, 180, 120, 0.7), rgba(160, 208, 140, 0.85));
  transition: width 0.3s ease;
}
.target-bar-text {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 11px;
  color: #e8e2d0;
  letter-spacing: 1px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

.reward-label {
  font-size: 12px;
  color: rgba(200, 170, 110, 0.7);
  letter-spacing: 2px;
}
.reward-val {
  font-size: 14px;
  color: #d4af6a;
  letter-spacing: 1px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
.claim-btn {
  margin-top: 4px;
  padding: 6px 22px;
  font-size: 13px;
  letter-spacing: 2px;
  color: #c8f0d4;
  background: linear-gradient(180deg, rgba(55, 100, 60, 0.85), rgba(38, 70, 42, 0.85));
  border: 1px solid rgba(127, 208, 154, 0.5);
  border-radius: 4px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  transition: all 0.15s ease;
  &:hover:not(:disabled) {
    border-color: rgba(127, 208, 154, 0.9);
    box-shadow: 0 0 10px rgba(127, 208, 154, 0.25);
  }
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.empty-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  font-size: 12px;
  color: rgba(200, 180, 140, 0.4);
  letter-spacing: 2px;
}
</style>
