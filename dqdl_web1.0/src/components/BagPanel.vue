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
import { sellItem } from '../api'
import FloatingTooltip from './FloatingTooltip.vue'

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
onUnmounted(() => {
  unmount()
  clearPagerDrag()
})

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
      } catch {
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
  tipOpen.value = false // 拖拽期间关闭 tooltip
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

/* ============ 拖拽到翻页按钮自动翻页 ============
   拖拽期间键盘事件被浏览器抑制，快捷键 [ ] 失效，改用 dragover 驱动翻页。
   规则：拖到按钮上停留超 1 秒开始翻页，之后每 1 秒翻一页（连续），
   移开/拖拽结束则停止。翻页到边界（prevPage/nextPage 有边界判断）自动停。

   关键：dragover 在悬停期间会持续高频触发，若每次都重置定时器，
   1 秒延时器永远等不到触发。故用 pagerDragArmed 标记"已在计时中"，
   首次 dragover 启动，后续 dragover 直接跳过。 */
let pagerDragTimer = null
let pagerDragArmed = false
/** 开始拖拽翻页：1秒后首次翻，之后每1秒翻一次（首次之后忽略重复 dragover） */
function startPagerDrag(dir) {
  if (pagerDragArmed) return // 已在计时中，忽略高频重复 dragover
  pagerDragArmed = true
  const fn = dir === 'next' ? nextPage : prevPage
  // 1 秒后首次翻页
  pagerDragTimer = setTimeout(() => {
    fn()
    // 之后每 1 秒翻一页
    pagerDragTimer = setInterval(fn, 1000)
  }, 1000)
}
/** 停止拖拽翻页（dragleave / dragend 调用） */
function clearPagerDrag() {
  pagerDragArmed = false
  if (pagerDragTimer) {
    clearTimeout(pagerDragTimer)
    clearInterval(pagerDragTimer)
    pagerDragTimer = null
  }
}
/** 拖拽结束兜底清理（无论 drop 是否成功） */
function onDragEnd() {
  draggingSlot.value = null
  clearPagerDrag()
}

async function onDrop(e, toSlot) {
  e.preventDefault()
  const fromSlot = draggingSlot.value
  onDragEnd() // 清拖拽态 + 翻页定时器
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

/* ============ 交易态右键出售 ============
   交易态（商店打开时 backpackStore.trading=true）：右键 slot 触发出售。
   count==1 直接卖；count>1 弹数量输入框（带「最大」按钮=当前持有量）。
   出售价/扣费由后端计算，前端只发 itemId+count，返回的 money 同步 store。 */
const sellModal = ref(null) // { item_id, name, max } 弹窗状态，null=关闭
const sellCount = ref(1)
const selling = ref(false)

/** 右键 slot：交易态才响应 */
function onSlotContextmenu(e, data) {
  if (!backpackStore.trading || !data) return
  e.preventDefault()
  // count==1 直接卖，无需弹窗
  if (data.count <= 1) {
    doSell(data.item_id, 1)
    return
  }
  // count>1 弹数量输入框
  sellModal.value = { item_id: data.item_id, name: data.item?.name || data.item_id, max: data.count }
  sellCount.value = 1
}

/** 执行出售（调后端，同步 money + 刷新背包） */
async function doSell(itemId, count) {
  if (selling.value || !props.playerId) return
  selling.value = true
  try {
    const res = await sellItem(props.playerId, itemId, count)
    backpackStore.setMoney(res.money)    // 同步金币（后端返回）
    await backpackStore.reload(props.playerId) // 刷新背包（物品数量变了）
    bus.emit(BusEvents.TOAST, { type: 'success', message: `出售了 ${count} 个` })
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '出售失败' })
  } finally {
    selling.value = false
    sellModal.value = null
  }
}

/** 确认弹窗出售 */
function confirmSell() {
  const c = Math.max(1, Math.min(sellCount.value, sellModal.value?.max || 1))
  doSell(sellModal.value.item_id, c)
}

/** 数量弹窗「最大」按钮 */
function setSellMax() {
  if (sellModal.value) sellCount.value = sellModal.value.max
}

/* ============ 快捷翻页（[ ] / 【 】）============
   背包聚焦（v-model 打开）时生效。支持中英文括号（中文输入法下也是 [】）。 */
function onKeydown(e) {
  if (!props.modelValue) return
  if (e.key === '[' || e.key === '【') {
    prevPage()
  } else if (e.key === ']' || e.key === '】') {
    nextPage()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

const TYPE_LABEL = {
  材料: '材料', 魔核: '魔核', 草药: '草药', 丹药: '丹药',
  武器: '武器', 功法: '功法', 武技: '武技', 防具: '防具',
  消耗品: '消耗品', 特殊: '特殊', 丹方: '丹方', 丹炉: '丹炉',
}

/* ============ 物品 tooltip（35 格共享一个 FloatingTooltip 实例） ============
   hover 某格时记录该格 DOM 元素 + 物品数据，传给单一浮层；拖拽中禁用。 */
const hoveredEl = ref(null)
const hoveredData = ref(null)
const tipOpen = ref(false)
function onSlotEnter(e, data) {
  if (draggingSlot.value !== null) return
  hoveredEl.value = e.currentTarget
  hoveredData.value = data
  tipOpen.value = true
}
function onSlotLeave() {
  tipOpen.value = false
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
        :class="{ 'is-empty': !ps.data, 'has-item': ps.data, 'drag-over': draggingSlot === ps.slot, 'is-trading': backpackStore.trading && ps.data }"
        draggable="true"
        @dragstart="onDragStart($event, ps.slot)"
        @dragend="onDragEnd"
        @dragover="onDragOver"
        @drop="onDrop($event, ps.slot)"
        @pointerenter="ps.data && onSlotEnter($event, ps.data)"
        @pointerleave="ps.data && onSlotLeave"
        @contextmenu="onSlotContextmenu($event, ps.data)"
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
        </template>
      </div>
    </div>

    <!-- 物品 tooltip：35 格共享一个浮层，Teleport 到 body（绕开 .bag-content overflow） -->
    <FloatingTooltip
      v-model:open="tipOpen"
      :reference="hoveredEl"
      placement="top"
    >
      <div class="tip-name">
        {{ hoveredData?.item?.name || hoveredData?.item_id }}
      </div>
      <div
        v-if="hoveredData?.item?.type"
        class="tip-type"
      >
        {{ TYPE_LABEL[hoveredData.item.type] || hoveredData.item.type }}
      </div>
      <div
        v-if="hoveredData?.item?.description"
        class="tip-desc"
      >
        {{ hoveredData.item.description }}
      </div>
      <div
        v-if="hoveredData?.sell_price != null"
        class="tip-price"
      >
        出售 {{ hoveredData.sell_price }} 金
      </div>
    </FloatingTooltip>

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
          @dragover.prevent="startPagerDrag('prev')"
          @dragleave="clearPagerDrag"
          @drop.prevent="clearPagerDrag"
        >
          ‹
        </button>
        <span class="pager-text">{{ currentPage }}/{{ TOTAL_PAGES }}</span>
        <button
          class="pager-btn"
          type="button"
          :disabled="currentPage >= TOTAL_PAGES"
          @click="nextPage"
          @dragover.prevent="startPagerDrag('next')"
          @dragleave="clearPagerDrag"
          @drop.prevent="clearPagerDrag"
        >
          ›
        </button>
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

    <!-- 出售数量弹窗（交易态右键 count>1 物品时弹出） -->
    <Teleport to="body">
      <div
        v-if="sellModal"
        class="sell-overlay"
        @click.self="sellModal = null"
      >
        <div class="sell-box">
          <div class="sell-title">出售 · {{ sellModal.name }}</div>
          <div class="sell-hint">持有 {{ sellModal.max }} 个</div>
          <div class="sell-input-row">
            <button
              class="sell-max-btn"
              type="button"
              @click="setSellMax"
            >最大</button>
            <input
              v-model.number="sellCount"
              type="number"
              :min="1"
              :max="sellModal.max"
              class="sell-input"
              @keyup.enter="confirmSell"
            >
          </div>
          <div class="sell-actions">
            <button
              class="sell-cancel"
              type="button"
              @click="sellModal = null"
            >取消</button>
            <button
              class="sell-confirm"
              type="button"
              :disabled="selling || !sellCount || sellCount < 1"
              @click="confirmSell"
            >{{ selling ? '出售中...' : '确认出售' }}</button>
          </div>
        </div>
      </div>
    </Teleport>
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

/* 交易态：有物品的格子高亮，提示可右键出售 */
.slot.is-trading {
  border-color: rgba(127, 208, 154, 0.55);
  box-shadow: inset 0 0 6px rgba(127, 208, 154, 0.15);
}
.slot.is-trading:hover {
  border-color: rgba(127, 208, 154, 0.9);
  box-shadow: inset 0 0 8px rgba(127, 208, 154, 0.25);
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

/* hover tooltip 内容样式（浮层外壳由 FloatingTooltip 提供，Teleport 到 body；
   这些 class 打在 BagPanel 模板的元素上，scoped 属性随元素走，仍能匹配） */
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

/* ============ 出售数量弹窗 ============ */
.sell-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}
.sell-box {
  width: 280px;
  padding: 20px;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.97), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.7);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.sell-title {
  font-size: 1rem;
  color: #f0d890;
  letter-spacing: 2px;
  text-align: center;
  margin-bottom: 6px;
}
.sell-hint {
  text-align: center;
  color: rgba(200, 170, 110, 0.6);
  font-size: 0.78rem;
  margin-bottom: 14px;
}
.sell-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.sell-max-btn {
  padding: 6px 14px;
  background: rgba(55, 42, 24, 0.85);
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 4px;
  color: #e8d5a0;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-size: 0.82rem;
  letter-spacing: 1px;
}
.sell-max-btn:hover {
  border-color: rgba(220, 190, 120, 0.9);
}
.sell-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  background: rgba(20, 16, 10, 0.7);
  border: 1px solid rgba(150, 120, 70, 0.4);
  border-radius: 4px;
  color: #e8d5a0;
  font-size: 0.9rem;
  outline: none;
}
.sell-input:focus {
  border-color: rgba(220, 190, 120, 0.7);
}
.sell-actions {
  display: flex;
  gap: 10px;
}
.sell-cancel,
.sell-confirm {
  flex: 1;
  padding: 8px 0;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-size: 0.85rem;
  letter-spacing: 1px;
  transition: all 0.15s ease;
}
.sell-cancel {
  background: rgba(35, 28, 18, 0.6);
  border: 1px solid rgba(150, 120, 70, 0.4);
  color: rgba(200, 170, 110, 0.7);
}
.sell-confirm {
  background: linear-gradient(180deg, rgba(55, 100, 60, 0.85), rgba(38, 70, 42, 0.85));
  border: 1px solid rgba(127, 208, 154, 0.5);
  color: #c8f0d4;
}
.sell-confirm:hover:not(:disabled) {
  border-color: rgba(127, 208, 154, 0.9);
  box-shadow: 0 0 10px rgba(127, 208, 154, 0.25);
}
.sell-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
