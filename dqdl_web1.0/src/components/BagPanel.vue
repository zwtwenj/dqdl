<script setup>
/**
 * 背包弹窗（RPG 风格）：右下角功能栏正上方浮窗。
 * 用 bag.png 做边框背景，内部 5×7=35 格/页 × 10 页 = 350 格。
 * 支持：分页切换、物品拖拽交换、整理（按 item_id 排序）、显示金币。
 *
 * 数据来源：backpackStore（内存常驻），打开背包不发请求（0ms 响应）。
 * 拖拽/整理走 store（store 内部调接口 + 更新内存）。
 * 外部变更（掉落）通过 store.dirty 标记，打开时静默刷新。
 *
 * Props:
 *   modelValue (boolean) - 是否显示
 *   playerId   (number)  - 玩家ID
 * Emits:
 *   update:modelValue - 关闭
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useBackpackStore } from '../stores/backpack'
import { bus, BusEvents } from '../utils/eventBus'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'

const props = defineProps({
  modelValue: Boolean,
  playerId: { type: Number, default: null },
  /** 弹窗位置（受控）：null = 沿用 CSS 默认定位（右下）；{x,y} = 显式左上坐标 */
  pos: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:pos'])

const backpackStore = useBackpackStore()

/* ============ 弹窗层级（后打开/点击的在上） ============ */
const { z, focus, mount, unmount } = usePanelStack('bag')
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      mount()
      focus()
    } else {
      unmount()
    }
  },
)
/* ============ 弹窗拖拽（标题栏作手柄，不干扰内部格子 HTML5 DnD） ============ */
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
onMounted(() => props.modelValue && mount())
onUnmounted(unmount)

/** 网格规格：5 列 × 7 行 = 35 格/页，共 10 页 = 350 格 */
const GRID_COLS = 5
const GRID_ROWS = 7
const SLOTS_PER_PAGE = GRID_COLS * GRID_ROWS // 35
const TOTAL_PAGES = 10

const currentPage = ref(1)

/** 图标兜底：缺失统一用 cl-100.png */
const FALLBACK_ICON = '/icon/cl/cl-100.png'

/** 从 store 构建 slot→data 映射（computed，store 变化自动更新） */
const slotMap = computed(() => {
  const map = new Map()
  for (const s of backpackStore.slots) {
    if (s.slot) map.set(s.slot, s)
  }
  return map
})

const money = computed(() => backpackStore.money)

/** 物品图标路径推导 */
function iconUrl(item) {
  if (!item) return FALLBACK_ICON
  if (item.icon) return item.icon
  const id = item.item_id
  if (id.startsWith('cl-')) return `/icon/cl/${id}.png`
  if (id.startsWith('mh-')) return `/icon/mh/${id}.png`
  if (id.startsWith('yb-')) return `/icon/alchemy/${id}.png`
  return FALLBACK_ICON
}

function onIconError(e) {
  if (e.target.src !== FALLBACK_ICON) {
    e.target.src = FALLBACK_ICON
  }
}

/** 当前页的 35 个格子 */
const pageSlots = computed(() => {
  const start = (currentPage.value - 1) * SLOTS_PER_PAGE + 1
  const result = []
  for (let i = 0; i < SLOTS_PER_PAGE; i++) {
    const slotNum = start + i
    result.push({ slot: slotNum, data: slotMap.value.get(slotNum) || null })
  }
  return result
})

/** 打开背包：数据已在内存（store），只在脏时静默刷新 */
watch(
  () => props.modelValue,
  async (v) => {
    if (v && props.playerId && backpackStore.dirty) {
      // 有外部变更（如掉落），静默刷新（后台拉取，不阻塞显示）
      try {
        await backpackStore.reload(props.playerId)
      } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: '背包刷新失败' })
      }
    }
  },
)

function close() {
  emit('update:modelValue', false)
}

/* ============ 分页 ============ */
function prevPage() {
  if (currentPage.value > 1) currentPage.value--
}
function nextPage() {
  if (currentPage.value < TOTAL_PAGES) currentPage.value++
}

/* ============ 拖拽（走 store，乐观更新） ============ */
const draggingSlot = ref(null)

function onDragStart(e, slotNum) {
  if (!slotMap.value.has(slotNum)) {
    e.preventDefault()
    return
  }
  draggingSlot.value = slotNum
  e.dataTransfer.effectAllowed = 'move'
  // 自定义拖拽镜像：只用物品图标，不用整个 slot（避免 tooltip 等子元素干扰）
  const icon = e.currentTarget.querySelector('.slot-icon')
  if (icon) {
    e.dataTransfer.setDragImage(icon, icon.offsetWidth / 2, icon.offsetHeight / 2)
  }
}

function onDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}

async function onDrop(e, toSlot) {
  e.preventDefault()
  const fromSlot = draggingSlot.value
  draggingSlot.value = null
  if (fromSlot === null || fromSlot === toSlot) return
  try {
    await backpackStore.move(props.playerId, fromSlot, toSlot)
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '移动失败' })
  }
}

/* ============ 整理（走 store） ============ */
const sorting = ref(false)
async function onSort() {
  sorting.value = true
  try {
    await backpackStore.sort(props.playerId)
    currentPage.value = 1
    bus.emit(BusEvents.TOAST, { type: 'info', message: '背包已整理' })
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '整理失败' })
  } finally {
    sorting.value = false
  }
}

const TYPE_LABEL = {
  材料: '材料', 魔核: '魔核', 草药: '草药', 丹药: '丹药',
  武器: '武器', 功法: '功法', 武技: '武技', 防具: '防具',
  消耗品: '消耗品', 特殊: '特殊', 丹方: '丹方', 丹炉: '丹炉',
}
</script>

<template>
  <div
    v-if="modelValue"
    ref="panelRef"
    class="bag-panel"
    :class="{ 'is-dragging': dragging }"
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
    @pointerdown="focus"
  >
    <!-- 边框背景图 -->
    <img
      class="bag-frame"
      src="/player/bag.png"
      alt=""
    >

    <!-- 关闭按钮 -->
    <button
      class="close-btn"
      type="button"
      title="关闭"
      @click="close"
    >
      ×
    </button>

    <!-- 标题（同时是拖拽手柄） -->
    <div
      class="bag-title drag-handle"
      title="拖拽移动"
      @pointerdown.stop="onHandlePointerDown"
    >
      背包
    </div>

    <!-- 物品网格区（35 格，数据常驻内存，无加载态） -->
    <div class="bag-content">
      <div
        v-for="ps in pageSlots"
        :key="ps.slot"
        class="slot"
        :class="{ 'is-empty': !ps.data, 'has-item': ps.data, 'drag-over': draggingSlot === ps.slot }"
        draggable="true"
        @dragstart="onDragStart($event, ps.slot)"
        @dragover="onDragOver"
        @drop="onDrop($event, ps.slot)"
      >
          <!-- 物品 -->
          <template v-if="ps.data">
            <img
              class="slot-icon"
              :src="iconUrl(ps.data.item)"
              :alt="ps.data.item?.name"
              @error="onIconError"
            >

            <!-- 数量角标 -->
            <span
              v-if="ps.data.count > 1"
              class="slot-count"
            >{{ ps.data.count }}</span>

            <!-- hover tooltip（拖拽进行中时不显示） -->
            <div
              v-show="draggingSlot === null"
              class="slot-tip"
            >
              <div class="tip-name">
                {{ ps.data.item?.name || ps.data.item_id }}
              </div>
              <div
                v-if="ps.data.item?.type"
                class="tip-type"
              >
                {{ TYPE_LABEL[ps.data.item.type] || ps.data.item.type }}
              </div>
              <div
                v-if="ps.data.item?.description"
                class="tip-desc"
              >
                {{ ps.data.item.description }}
              </div>
              <div
                v-if="ps.data.item?.price"
                class="tip-price"
              >
                约值 {{ ps.data.item.price }} 金
              </div>
            </div>
          </template>
      </div>
    </div>

    <!-- 底部工具栏：整理 | 分页 | 金币 -->
    <div class="bag-toolbar">
      <button
        class="toolbar-btn sort-btn"
        type="button"
        :disabled="sorting"
        @click="onSort"
      >
        整理
      </button>
      <div class="toolbar-pager">
        <button
          class="pager-btn"
          type="button"
          :disabled="currentPage <= 1"
          @click="prevPage"
        >‹</button>
        <span class="pager-text">{{ currentPage }}/{{ TOTAL_PAGES }}</span>
        <button
          class="pager-btn"
          type="button"
          :disabled="currentPage >= TOTAL_PAGES"
          @click="nextPage"
        >›</button>
      </div>
      <div class="toolbar-money">
        <img
          class="money-icon"
          src="/icon/btn/task.png"
          alt=""
        >
        <span class="money-val">{{ money }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bag-panel {
  position: absolute;
  right: 14px;
  bottom: 84px;
  z-index: 50;
  width: 400px;
  height: 500px;
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.7));
}

.bag-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  user-select: none;
}

.close-btn {
  position: absolute;
  top: 6px;
  right: 15px;
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

.bag-title {
  position: absolute;
  top: 14px;
  left: 0;
  right: 0;
  z-index: 2;
  text-align: center;
  font-size: 15px;
  letter-spacing: 6px;
  color: #e8d5a0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

/* 拖拽手柄：覆盖上面的 pointer-events:none，恢复交互 */
.drag-handle {
  pointer-events: auto;
  cursor: move;
  user-select: none;
  -webkit-user-select: none;
}
/* 拖拽中禁用内部 iframe/拖拽事件干扰 */
.bag-panel.is-dragging {
  user-select: none;
  -webkit-user-select: none;
}
.bag-panel.is-dragging .slot {
  /* 拖窗期间禁止格子被 HTML5 拖拽误触 */
  pointer-events: none;
}

/* 物品网格区（5列×7行=35格） */
.bag-content {
  position: absolute;
  /* 网格区在边框内部，留出顶部标题栏和四周边距 */
  top: 60px;
  left: 60px;
  right: 60px;
  bottom: 70px;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-template-rows: repeat(7, 1fr);
  gap: 3px;
}

.bag-status {
  grid-column: 1 / -1;
  grid-row: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: rgba(200, 170, 110, 0.6);
  letter-spacing: 2px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* 格子：纯 CSS 背景，不用 groove.png */
.slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 6, 4, 0.75);
  border: 1px solid rgba(120, 100, 60, 0.3);
  border-radius: 3px;
  cursor: default;
  transition: border-color 0.15s, background 0.15s;
}

.slot.has-item {
  cursor: grab;
  background: rgba(20, 16, 10, 0.85);
  border-color: rgba(160, 130, 70, 0.4);
}

.slot.has-item:hover {
  border-color: rgba(220, 190, 120, 0.7);
  background: rgba(30, 24, 14, 0.9);
}

.slot.drag-over {
  border-color: rgba(100, 200, 255, 0.8);
  background: rgba(20, 40, 60, 0.6);
}

.slot.is-empty {
  opacity: 0.6;
}

.slot-icon {
  position: relative;
  z-index: 1;
  width: 82%;
  height: 82%;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  pointer-events: none;
}

/* 数量角标 */
.slot-count {
  position: absolute;
  right: 1px;
  bottom: 0;
  z-index: 2;
  min-width: 15px;
  height: 13px;
  padding: 0 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.75);
  border: 1px solid rgba(200, 170, 100, 0.4);
  border-radius: 7px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
}

/* hover tooltip */
.slot-tip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  width: 150px;
  padding: 6px 8px;
  background: rgba(15, 12, 8, 0.96);
  border: 1px solid rgba(200, 170, 100, 0.5);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.15s;
  pointer-events: none;
  text-align: center;
}
.slot:hover .slot-tip {
  opacity: 1;
  visibility: visible;
}

.tip-name {
  font-size: 13px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  margin-bottom: 3px;
}
.tip-type {
  font-size: 10px;
  color: rgba(200, 170, 110, 0.7);
  margin-bottom: 3px;
}
.tip-desc {
  font-size: 10px;
  color: rgba(190, 175, 145, 0.85);
  line-height: 1.5;
  word-break: break-all;
}
.tip-price {
  margin-top: 3px;
  font-size: 10px;
  color: #d4af6a;
}

/* 底部工具栏 */
.bag-toolbar {
  position: absolute;
  bottom: 38px;
  left: 60px;
  right: 60px;
  z-index: 2;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.toolbar-btn {
  padding: 4px 14px;
  font-size: 12px;
  letter-spacing: 2px;
  color: #e8d5a0;
  background: rgba(20, 16, 10, 0.8);
  border: 1px solid rgba(160, 130, 70, 0.4);
  border-radius: 3px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  transition: all 0.15s;
}
.toolbar-btn:hover:not(:disabled) {
  border-color: rgba(220, 190, 120, 0.7);
  background: rgba(35, 28, 16, 0.9);
}
.toolbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar-pager {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pager-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 14px;
  color: rgba(220, 190, 120, 0.8);
  background: rgba(20, 16, 10, 0.6);
  border: 1px solid rgba(120, 100, 60, 0.3);
  border-radius: 3px;
  cursor: pointer;
}
.pager-btn:hover:not(:disabled) {
  color: #e8d5a0;
  border-color: rgba(200, 170, 100, 0.5);
}
.pager-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
.pager-text {
  font-size: 11px;
  color: rgba(200, 170, 110, 0.8);
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  min-width: 32px;
  text-align: center;
}

.toolbar-money {
  display: flex;
  align-items: center;
  gap: 4px;
}
.money-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  opacity: 0.7;
}
.money-val {
  font-size: 12px;
  color: #d4af6a;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}
</style>
