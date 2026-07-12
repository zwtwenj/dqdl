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
import { getNpcShop, buyItem } from '../api'
import { useBackpackStore } from '../stores/backpack'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'

const FALLBACK_ICON = '/icon/cl/cl-100.png'
const backpackStore = useBackpackStore()

/* ============ 弹窗层级（与背包/角色面板共享 usePanelStack） ============ */
const { z, focus, mount, unmount } = usePanelStack('shop')

const open = ref(false)
const loading = ref(false)
const npcName = ref('')
const npcId = ref(null)
const playerId = ref(null)
const items = ref([])
const buying = ref(false) // 防重复提交

/* ============ 拖拽（标题栏作手柄） ============ */
const panelRef = ref(null)
const pos = ref(null) // null = 默认左上角定位
const { dragging, onHandlePointerDown } = usePanelDraggable({
  elRef: panelRef,
  pos,
  onStart: focus,
})

// open 状态联动 mount/unmount（加入/移出层级栈）+ 交易态
watch(open, (v) => {
  if (v) {
    mount()
    backpackStore.setTrading(true)
  } else {
    unmount()
    backpackStore.setTrading(false)
  }
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
async function handleOpen({ npcId: id, playerId: pid }) {
  npcId.value = id
  playerId.value = pid
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

/** 购买入口：直接点击=买1个，Shift+点击=弹数量输入框 */
function handleBuy(item, shift = false) {
  if (buying.value || !playerId.value) return
  if (shift) {
    // Shift+点击：弹数量输入框
    buyModal.value = { item_id: item.item_id, name: item.name, price: item.price }
    buyCount.value = 1
  } else {
    // 直接点击：买1个
    doBuy(item, 1)
  }
}

/** 执行购买（调后端 buy，单事务扣钱+加背包），返回新 money 同步 store + 标脏背包 */
async function doBuy(item, count) {
  if (buying.value || !playerId.value) return
  buying.value = true
  try {
    const res = await buyItem(playerId.value, item.item_id, count)
    backpackStore.setMoney(res.money)       // 同步金币（后端返回，前端不计算）
    // 主动刷新背包（背包此时已打开，markDirty 不会触发已开面板重载，必须 reload）
    await backpackStore.reload(playerId.value)
    bus.emit(BusEvents.TOAST, { type: 'success', message: `购买了 ${count} 个 ${item.name}` })
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '购买失败' })
  } finally {
    buying.value = false
    buyModal.value = null
  }
}

/* ============ 购买数量弹窗 ============ */
const buyModal = ref(null) // { item_id, name, price } 弹窗状态，null=关闭
const buyCount = ref(1)

/** 确认弹窗购买（按当前输入数量，校验上限=玩家金币可买数量） */
function confirmBuy() {
  const c = Math.max(1, Math.floor(Number(buyCount.value) || 0))
  if (!buyModal.value) return
  doBuy({ item_id: buyModal.value.item_id, name: buyModal.value.name }, c)
}

/** 弹窗：根据当前金币算"最大可购买数"并填入 */
function setBuyMax() {
  if (!buyModal.value) return
  const price = buyModal.value.price || 0
  const max = price > 0 ? Math.floor(backpackStore.money / price) : 1
  buyCount.value = Math.max(1, max)
}

/** 关闭 */
function close() {
  open.value = false
  items.value = []
  npcName.value = ''
  npcId.value = null
  playerId.value = null
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
        <span class="shop-money">💰 {{ backpackStore.money }} 金</span>
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
                :disabled="buying || backpackStore.money < item.price"
                :title="backpackStore.money < item.price ? '金币不足' : '购买（Shift+点击购买多个）'"
                @pointerdown.stop
                @click.stop="handleBuy(item, $event.shiftKey)"
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

      <!-- 购买数量弹窗（Shift+点击购买时弹出） -->
      <Teleport to="body">
        <div
          v-if="buyModal"
          class="buy-overlay"
          @click.self="buyModal = null"
        >
          <div class="buy-box">
            <div class="buy-title">购买 · {{ buyModal.name }}</div>
            <div class="buy-hint">单价 {{ buyModal.price }} 金 · 金币 {{ backpackStore.money }}</div>
            <div class="buy-input-row">
              <button
                class="buy-max-btn"
                type="button"
                @click="setBuyMax"
              >最大</button>
              <input
                v-model.number="buyCount"
                type="number"
                :min="1"
                class="buy-input"
                @keyup.enter="confirmBuy"
              >
            </div>
            <div class="buy-total">合计 {{ (buyModal.price || 0) * Math.max(0, buyCount || 0) }} 金</div>
            <div class="buy-actions">
              <button
                class="buy-cancel"
                type="button"
                @click="buyModal = null"
              >取消</button>
              <button
                class="buy-confirm"
                type="button"
                :disabled="buying || !buyCount || buyCount < 1"
                @click="confirmBuy"
              >{{ buying ? '购买中...' : '确认购买' }}</button>
            </div>
          </div>
        </div>
      </Teleport>
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
.shop-money {
  flex: 1;
  text-align: center;
  color: #f0d890;
  font-size: 0.88rem;
  letter-spacing: 1px;
  margin: 0 8px;
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
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-size: 0.75rem;
  letter-spacing: 1px;
  transition: all 0.15s ease;
}
/* 金币充足时 hover 高亮 */
.buy-btn:hover:not(:disabled) {
  border-color: rgba(220, 190, 120, 0.9);
  background: linear-gradient(180deg, rgba(75, 56, 32, 0.95), rgba(50, 38, 25, 0.95));
  box-shadow: 0 0 8px rgba(212, 175, 106, 0.25);
}
/* 金币不足 / 购买中：置灰禁止 */
.buy-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

/* ============ 购买数量弹窗（与出售弹窗同暗金风格） ============ */
.buy-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}
.buy-box {
  width: 280px;
  padding: 20px;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.97), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.7);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.buy-title {
  font-size: 1rem;
  color: #f0d890;
  letter-spacing: 2px;
  text-align: center;
  margin-bottom: 4px;
}
.buy-hint {
  text-align: center;
  color: rgba(200, 170, 110, 0.6);
  font-size: 0.78rem;
  margin-bottom: 14px;
}
.buy-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.buy-max-btn {
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
.buy-max-btn:hover {
  border-color: rgba(220, 190, 120, 0.9);
}
.buy-input {
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
.buy-input:focus {
  border-color: rgba(220, 190, 120, 0.7);
}
.buy-total {
  text-align: center;
  color: #f0d890;
  font-size: 0.82rem;
  margin-bottom: 14px;
  letter-spacing: 1px;
}
.buy-actions {
  display: flex;
  gap: 10px;
}
.buy-cancel,
.buy-confirm {
  flex: 1;
  padding: 8px 0;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-size: 0.85rem;
  letter-spacing: 1px;
  transition: all 0.15s ease;
}
.buy-cancel {
  background: rgba(35, 28, 18, 0.6);
  border: 1px solid rgba(150, 120, 70, 0.4);
  color: rgba(200, 170, 110, 0.7);
}
.buy-confirm {
  background: linear-gradient(180deg, rgba(55, 90, 130, 0.85), rgba(38, 65, 95, 0.85));
  border: 1px solid rgba(138, 180, 255, 0.5);
  color: #bcd8ff;
}
.buy-confirm:hover:not(:disabled) {
  border-color: rgba(138, 180, 255, 0.9);
  box-shadow: 0 0 10px rgba(138, 180, 255, 0.25);
}
.buy-confirm:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
