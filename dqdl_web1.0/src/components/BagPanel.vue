<script setup>
/**
 * 背包弹窗（RPG 风格）：右下角功能栏正上方浮窗。
 * 用 bag.png 做边框背景，内部 grid 网格放物品格。
 *
 * Props:
 *   modelValue (boolean) - 是否显示
 *   playerId   (number)  - 玩家ID（拉背包数据用）
 * Emits:
 *   update:modelValue - 关闭
 */
import { ref, watch } from 'vue'
import { getBackpack } from '../api'
import { bus, BusEvents } from '../utils/eventBus'

const props = defineProps({
  modelValue: Boolean,
  playerId: { type: Number, default: null },
})
const emit = defineEmits(['update:modelValue'])

/** 固定网格：4 列 × 6 行 = 24 格 */
const GRID_COLS = 4
const GRID_ROWS = 6
const TOTAL_SLOTS = GRID_COLS * GRID_ROWS

const slots = ref([])
const loading = ref(false)

/** 物品图标路径推导：item.icon 优先，否则按 item_id 前缀映射目录 */
function iconUrl(item) {
  if (!item) return null
  if (item.icon) return item.icon
  const id = item.item_id
  if (id.startsWith('cl-')) return `/icon/cl/${id}.png`
  if (id.startsWith('mh-')) return `/icon/mh/${id}.png`
  if (id.startsWith('yb-')) return `/icon/alchemy/${id}.png`
  return null
}

/** 填充网格：有物品的格 + 空格，凑满 TOTAL_SLOTS */
function fillGrid(items) {
  const filled = items.map((it) => ({ ...it, empty: false }))
  while (filled.length < TOTAL_SLOTS) {
    filled.push({ empty: true })
  }
  return filled.slice(0, TOTAL_SLOTS)
}

/** 拉取背包数据 */
async function loadBackpack() {
  if (!props.playerId) return
  loading.value = true
  try {
    const data = await getBackpack(props.playerId)
    slots.value = fillGrid(Array.isArray(data) ? data : [])
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载背包失败' })
    slots.value = fillGrid([])
  } finally {
    loading.value = false
  }
}

/** 显隐变化：打开时拉数据 */
watch(
  () => props.modelValue,
  (v) => {
    if (v) loadBackpack()
  },
)

function close() {
  emit('update:modelValue', false)
}

/** 物品类型 → 中文（tooltip 用） */
const TYPE_LABEL = {
  材料: '材料',
  魔核: '魔核',
  草药: '草药',
  丹药: '丹药',
  武器: '武器',
  功法: '功法',
  武技: '武技',
  防具: '防具',
  消耗品: '消耗品',
  特殊: '特殊',
  丹方: '丹方',
  丹炉: '丹炉',
}
</script>

<template>
  <div
    v-if="modelValue"
    class="bag-panel"
  >
      <!-- 边框背景图 -->
      <img
        class="bag-frame"
        src="/player/bag.png"
        alt=""
      >

      <!-- 关闭按钮（右上角，叠在边框上） -->
      <button
        class="close-btn"
        type="button"
        title="关闭"
        @click="close"
      >
        ×
      </button>

      <!-- 标题 -->
      <div class="bag-title">
        百宝囊
      </div>

      <!-- 物品网格区 -->
      <div class="bag-content">
        <div
          v-if="loading"
          class="bag-status"
        >
          翻找中...
        </div>
        <template v-else>
          <div
            v-for="(slot, idx) in slots"
            :key="idx"
            class="slot"
            :class="{ 'is-empty': slot.empty, 'has-item': !slot.empty }"
          >
            <!-- 格子槽位背景 -->
            <img
              class="slot-groove"
              src="/player/groove.png"
              alt=""
            >
            <!-- 物品图标 -->
            <template v-if="!slot.empty">
              <img
                v-if="iconUrl(slot.item)"
                class="slot-icon"
                :src="iconUrl(slot.item)"
                :alt="slot.item?.name"
              >
              <span
                v-else
                class="slot-icon-fallback"
              >{{ slot.item?.name?.slice(0, 1) }}</span>

              <!-- 数量角标 -->
              <span
                v-if="slot.count > 1"
                class="slot-count"
              >{{ slot.count }}</span>

              <!-- hover tooltip -->
              <div class="slot-tip">
                <div class="tip-name">
                  {{ slot.item?.name }}
                </div>
                <div
                  v-if="slot.item?.type"
                  class="tip-type"
                >
                  {{ TYPE_LABEL[slot.item.type] || slot.item.type }}
                </div>
                <div
                  v-if="slot.item?.description"
                  class="tip-desc"
                >
                  {{ slot.item.description }}
                </div>
                <div
                  v-if="slot.item?.price"
                  class="tip-price"
                >
                  约值 {{ slot.item.price }} 金
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>

      <!-- 空背包提示 -->
      <div
        v-if="!loading && slots.every((s) => s.empty)"
        class="bag-empty"
      >
        囊中空空
      </div>
  </div>
</template>

<style scoped>
.bag-panel {
  /* 相对父容器（.game-view）定位，与 IconToolbar 统一定位上下文，
     保证在 1200px 设计区内、与功能栏对齐，不会飘出设计区 */
  position: absolute;
  right: 14px;
  bottom: 84px;
  z-index: 50;
  width: 300px;
  height: 378px;
  /* bag.png 原始 398x502，按比例缩放到 300x378 */
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.7));
}

/* 边框背景图：绝对定位撑满容器，pointer-events 让点击穿透到上层交互元素 */
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
  right: 8px;
  z-index: 3;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  color: rgba(220, 190, 120, 0.7);
  background: transparent;
  border: none;
  border-radius: 50%;
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
  font-size: 16px;
  letter-spacing: 6px;
  color: #e8d5a0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}

.bag-content {
  position: absolute;
  /* 网格区在边框内部，留出顶部标题栏和四周边距 */
  top: 48px;
  left: 30px;
  right: 30px;
  bottom: 22px;
  z-index: 2;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(6, 1fr);
  gap: 4px;
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

.slot {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 格子槽位背景 */
.slot-groove {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
}

.slot.is-empty {
  opacity: 0.85;
}

.slot-icon {
  position: relative;
  z-index: 1;
  width: 80%;
  height: 80%;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}

.slot-icon-fallback {
  position: relative;
  z-index: 1;
  font-size: 16px;
  color: rgba(220, 200, 160, 0.7);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* 数量角标 */
.slot-count {
  position: absolute;
  right: 2px;
  bottom: 0;
  z-index: 2;
  min-width: 16px;
  height: 14px;
  padding: 0 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #fff;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(200, 170, 100, 0.5);
  border-radius: 8px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
}

/* hover tooltip */
.slot-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  width: 160px;
  padding: 8px 10px;
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
  font-size: 14px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  margin-bottom: 4px;
}

.tip-type {
  font-size: 11px;
  color: rgba(200, 170, 110, 0.7);
  margin-bottom: 4px;
}

.tip-desc {
  font-size: 11px;
  color: rgba(190, 175, 145, 0.85);
  line-height: 1.5;
  word-break: break-all;
}

.tip-price {
  margin-top: 4px;
  font-size: 11px;
  color: #d4af6a;
}

.bag-empty {
  position: absolute;
  top: 55%;
  left: 0;
  right: 0;
  z-index: 2;
  text-align: center;
  font-size: 15px;
  color: rgba(200, 170, 110, 0.45);
  letter-spacing: 4px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  pointer-events: none;
}
</style>
