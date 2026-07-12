<script setup>
/**
 * NPC 商店弹窗（浮动面板，左上角，暗金 RPG 风格）。
 *
 * 原子化触发：对话弹窗内点「交易」快捷事件 → dialogEventHandlers.trade
 *   → emit BusEvents.NPC_SHOP_OPEN { playerId, npcId } → 本组件监听并自治处理。
 *
 * 浮动面板形态：与背包/角色面板一致，用 usePanelStack 管理层级（互斥置顶），
 * 用 usePanelDraggable 支持拖拽（标题栏作手柄）。
 *
 * 本期只做商品展示，购买/出售按钮置灰（购买逻辑待后续原子接入）。
 * 前端不做任何 DB 数据计算（金额/库存/扣费一律走后端接口）。
 */
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { getNpcShop } from '../api'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'

const FALLBACK_ICON = '/icon/cl/cl-100.png'

/* ============ 弹窗层级（与背包/角色面板共享 usePanelStack） ============ */
const { z, focus, mount, unmount } = usePanelStack('shop')

const open = ref(false)
const loading = ref(false)
const npcName = ref('')
const npcId = ref(null)
const items = ref([])

/* ============ 拖拽（标题栏作手柄） ============ */
const panelRef = ref(null)
const pos = ref(null) // null = 默认左上角定位
const { dragging, onHandlePointerDown } = usePanelDraggable({
  elRef: panelRef,
  pos,
  onStart: focus,
})

// open 状态联动 mount/unmount（加入/移出层级栈）
watch(open, (v) => {
  if (v) mount()
  else unmount()
})

/** 物品图标路径推导（复用 BagPanel 逻辑） */
function iconUrl(item) {
  if (!item) return FALLBACK_ICON
  if (item.icon) return item.icon
  const id = item.item_id
  if (id.startsWith('cl-')) return `/icon/cl/${id}.png`
  if (id.startsWith('mh-')) return `/icon/mh/${id}.png`
  if (id.startsWith('yb-')) return `/icon/alchemy/${id}.png`
  if (id.startsWith('dj-')) return `/icon/skill/${id}.png`
  if (id.startsWith('gf-')) return `/icon/skill/${id}.png`
  return FALLBACK_ICON
}
function onIconError(e) {
  if (e.target.src !== FALLBACK_ICON) e.target.src = FALLBACK_ICON
}

/** 打开商店：{ playerId, npcId } → 拉商品 → mount + focus 置顶 */
async function handleOpen({ npcId: id }) {
  npcId.value = id
  open.value = true
  focus() // 置顶（在背包之上）
  loading.value = true
  items.value = []
  npcName.value = ''
  try {
    const res = await getNpcShop(id)
    npcName.value = res.npcName || '神秘商人'
    items.value = res.items || []
  } catch (err) {
    npcName.value = '商铺'
    items.value = []
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载商品失败' })
  } finally {
    loading.value = false
  }
}

/** 购买（本期置灰，待后续接入。购买金额/扣费由后端计算） */
function handleBuy() {
  bus.emit(BusEvents.TOAST, { type: 'info', message: '购买功能即将开放' })
}

/** 关闭 */
function close() {
  open.value = false
  items.value = []
  npcName.value = ''
  npcId.value = null
}

/** 悬浮提示 */
const hoveredItem = ref(null)
const tipX = ref(0)
const tipY = ref(0)
function onItemEnter(item, e) {
  hoveredItem.value = item
  tipX.value = e.clientX
  tipY.value = e.clientY
}
function onItemLeave() {
  hoveredItem.value = null
}

let offOpen = null
onMounted(() => {
  offOpen = bus.on(BusEvents.NPC_SHOP_OPEN, handleOpen)
})
onUnmounted(() => {
  offOpen && offOpen()
  unmount()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panelRef"
      class="shop-panel"
      :class="{ 'is-dragging': dragging }"
      :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
      @pointerdown="focus"
    >
      <!-- 标题栏（拖拽手柄） -->
      <div
        class="shop-header"
        @pointerdown="onHandlePointerDown"
      >
        <span class="shop-title">{{ npcName }} · 杂货铺</span>
        <button
          class="shop-close"
          type="button"
          @pointerdown.stop
          @click="close"
        >
          ×
        </button>
      </div>

      <!-- 商品网格 -->
      <div class="shop-body">
        <div
          v-if="loading"
          class="shop-empty"
        >
          正在摆出商品...
        </div>
        <div
          v-else-if="!items.length"
          class="shop-empty"
        >
          该店铺暂无商品
        </div>
        <div
          v-else
          class="shop-grid"
        >
          <div
            v-for="item in items"
            :key="item.item_id"
            class="shop-item"
            @pointerenter="onItemEnter(item, $event)"
            @pointerleave="onItemLeave"
          >
            <div class="shop-item-icon">
              <img
                :src="iconUrl(item)"
                :alt="item.name"
                @error="onIconError"
              >
            </div>
            <div class="shop-item-info">
              <span class="shop-item-name">{{ item.name }}</span>
              <span class="shop-item-type">{{ item.type }}</span>
            </div>
            <div class="shop-item-bottom">
              <span class="shop-item-price">{{ item.price }} 金</span>
              <button
                class="buy-btn"
                type="button"
                disabled
                title="购买功能即将开放"
                @pointerdown.stop
                @click.stop="handleBuy"
              >
                购买
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 悬浮提示 -->
      <div
        v-if="hoveredItem"
        class="shop-tip"
        :style="{ left: tipX + 14 + 'px', top: tipY + 14 + 'px' }"
      >
        <div class="tip-name">{{ hoveredItem.name }}</div>
        <div class="tip-type">{{ hoveredItem.type }} · 约值 {{ hoveredItem.price }} 金</div>
        <div
          v-if="hoveredItem.description"
          class="tip-desc"
        >
          {{ hoveredItem.description }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 浮动面板：绝对定位左上角（默认），与背包/角色面板同体系 */
.shop-panel {
  position: fixed;
  left: 40px;
  top: 40px;
  width: 440px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.97), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 10px;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(220, 190, 120, 0.14);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  overflow: hidden;
}
.shop-panel.is-dragging {
  cursor: grabbing;
  user-select: none;
}

/* 标题栏（拖拽手柄） */
.shop-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  background: rgba(10, 8, 6, 0.65);
  border-bottom: 1px solid rgba(180, 150, 90, 0.3);
  cursor: grab;
}
.shop-header:active {
  cursor: grabbing;
}
.shop-title {
  color: #f0d890;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.shop-close {
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
.shop-close:hover {
  color: #ff9080;
  border-color: rgba(255, 120, 100, 0.6);
  background: rgba(60, 20, 15, 0.5);
}

/* 商品区 */
.shop-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
}
.shop-body::-webkit-scrollbar {
  width: 5px;
}
.shop-body::-webkit-scrollbar-thumb {
  background: rgba(180, 150, 90, 0.3);
  border-radius: 3px;
}
.shop-empty {
  text-align: center;
  color: rgba(200, 170, 110, 0.5);
  padding: 50px 0;
  font-style: italic;
}

/* 商品网格（浮动面板较窄，用 2 列） */
.shop-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.shop-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  background: rgba(35, 28, 18, 0.6);
  border: 1px solid rgba(150, 120, 70, 0.3);
  border-radius: 7px;
  transition: all 0.18s ease;
}
.shop-item:hover {
  border-color: rgba(220, 190, 120, 0.7);
  background: rgba(45, 36, 22, 0.78);
  box-shadow: 0 0 12px rgba(212, 175, 106, 0.18);
}
.shop-item-icon {
  width: 100%;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 8, 6, 0.55);
  border: 1px solid rgba(180, 150, 90, 0.18);
  border-radius: 5px;
}
.shop-item-icon img {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
}
.shop-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}
.shop-item-name {
  color: #e8d5a0;
  font-size: 0.85rem;
  letter-spacing: 1px;
  line-height: 1.2;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}
.shop-item-type {
  color: rgba(200, 170, 110, 0.55);
  font-size: 0.68rem;
}
.shop-item-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.shop-item-price {
  color: #f0d890;
  font-size: 0.8rem;
  letter-spacing: 1px;
}
.buy-btn {
  padding: 3px 10px;
  background: linear-gradient(180deg, rgba(55, 42, 24, 0.85), rgba(38, 28, 18, 0.85));
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 4px;
  color: #e8d5a0;
  cursor: not-allowed;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-size: 0.75rem;
  letter-spacing: 1px;
  opacity: 0.5;
}

/* 悬浮提示 */
.shop-tip {
  position: fixed;
  z-index: 9999;
  max-width: 230px;
  padding: 9px 11px;
  background: rgba(14, 11, 8, 0.96);
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 6px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.7);
  pointer-events: none;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.tip-name {
  color: #f0d890;
  font-weight: 700;
  font-size: 0.9rem;
  letter-spacing: 1px;
  margin-bottom: 3px;
}
.tip-type {
  color: rgba(200, 170, 110, 0.7);
  font-size: 0.72rem;
  margin-bottom: 5px;
}
.tip-desc {
  color: #c8c0a8;
  font-size: 0.78rem;
  line-height: 1.5;
}
</style>
