<script setup>
/**
 * 宝物面板（独立弹窗，功能栏"宝物"按钮触发）。
 *
 * 展示玩家已装备的 5 个宝物槽位（含空槽），悬浮 tooltip 显示属性加成，
 * 可卸下宝物（返还物品到背包）。
 *
 * Props / Emits 与 BagPanel/SkillPanel 同模式：
 *   modelValue (boolean) - 是否显示
 *   player    (object)   - 玩家完整数据（findOne 聚合，含 treasures 数组）
 *   pos       (object)   - 弹窗位置（可拖拽）
 */
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'
import { bus, BusEvents } from '../utils/eventBus'
import { unequipTreasure } from '../api'
import FloatingTooltip from './FloatingTooltip.vue'

const props = defineProps({
  modelValue: Boolean,
  player: { type: Object, default: null },
  pos: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:pos'])

const { z, focus, mount, unmount } = usePanelStack('treasure')
watch(
  () => props.modelValue,
  (v) => {
    if (v) { mount(); focus() } else unmount()
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

/* ---- 宝物数据 ---- */
const TOTAL_SLOTS = 5

/** 已装备宝物按 slot 索引 {slot: treasure} */
const treasureMap = computed(() => {
  const map = {}
  const list = props.player?.treasures
  if (Array.isArray(list)) {
    for (const t of list) map[t.slot] = t
  }
  return map
})

/** 5 个槽位（含空槽），按 1-5 顺序 */
const slots = computed(() => {
  return Array.from({ length: TOTAL_SLOTS }, (_, i) => {
    const slot = i + 1
    return { slot, treasure: treasureMap.value[slot] || null }
  })
})

/* ---- 属性/效果文案 ---- */
const ATTR_LABEL = { power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质', lucky: '运气', hp: '生命', energy: '斗气' }
const EFFECT_LABEL = { cultivation_efficiency: '修炼效率' }
const EFFECT_UNIT = { cultivation_efficiency: '%' }
function statText(t) {
  const s = t?.stats || {}
  return Object.keys(s).map((k) => `${ATTR_LABEL[k] || k}+${s[k]}`).join(' ')
}
function effectText(t) {
  const e = t?.effects || {}
  return Object.keys(e).map((k) => `${EFFECT_LABEL[k] || k}+${e[k]}${EFFECT_UNIT[k] || ''}`).join(' ')
}

/* ---- 卸下 ---- */
const unequipping = ref(false)
async function doUnequip(slot) {
  if (unequipping.value || !props.player?.id) return
  unequipping.value = true
  try {
    const res = await unequipTreasure(props.player.id, slot)
    if (res?.player) {
      bus.emit(BusEvents.PLAYER_UPDATE, { player: res.player })
      bus.emit(BusEvents.TOAST, { type: 'success', message: '已卸下宝物' })
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '卸下失败' })
  } finally {
    unequipping.value = false
  }
}

/* ---- tooltip ---- */
const tipOpen = ref(false)
const tipData = ref(null)
const hoveredEl = ref(null)
function onEnter(e, t) {
  if (!t) return
  hoveredEl.value = e.currentTarget
  tipData.value = t
  tipOpen.value = true
}
function onLeave() {
  tipOpen.value = false
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <div
    v-if="modelValue"
    ref="panelRef"
    class="treasure-panel"
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
    @pointerdown="focus"
  >
    <!-- 头部（可拖拽） -->
    <div
      class="panel-header"
      @pointerdown.stop="onHandlePointerDown"
    >
      <span class="panel-title">💎 宝物</span>
      <button
        class="panel-close"
        type="button"
        @click="close"
      >×</button>
    </div>

    <!-- 槽位区：5 格 grid -->
    <div class="slot-grid">
      <div
        v-for="s in slots"
        :key="s.slot"
        :class="['slot', { 'slot-empty': !s.treasure }]"
        @pointerenter="onEnter($event, s.treasure)"
        @pointerleave="onLeave"
      >
        <template v-if="s.treasure">
          <span class="slot-icon">{{ s.treasure.icon || '💎' }}</span>
          <span class="slot-name">{{ s.treasure.name }}</span>
          <span class="slot-cat">{{ s.treasure.category }}</span>
          <button
            class="slot-unequip"
            type="button"
            :disabled="unequipping"
            @click.stop="doUnequip(s.slot)"
          >卸</button>
        </template>
        <template v-else>
          <span class="slot-empty-icon">-empty-</span>
        </template>
      </div>
    </div>

    <div class="panel-hint">
      在背包中「使用」宝物即可装备；悬浮查看属性，卸下后以物品形态返回背包。
    </div>

    <!-- tooltip 浮层 -->
    <FloatingTooltip
      v-model:open="tipOpen"
      :reference="hoveredEl"
      placement="right-start"
    >
      <div class="tip-name">{{ tipData?.name || '未知宝物' }}</div>
      <div v-if="tipData && statText(tipData)" class="tip-stat">{{ statText(tipData) }}</div>
      <div v-if="tipData && effectText(tipData)" class="tip-effect">{{ effectText(tipData) }}</div>
      <div v-if="tipData?.description" class="tip-desc">{{ tipData.description }}</div>
    </FloatingTooltip>
  </div>
</template>

<style scoped>
.treasure-panel {
  position: absolute;
  right: 20px;
  bottom: 80px;
  width: 380px;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.97), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(150, 120, 70, 0.25);
  background: rgba(40, 30, 18, 0.5);
  cursor: move;
}
.panel-title {
  font-size: 16px;
  color: #e8d5a0;
  letter-spacing: 2px;
}
.panel-close {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(150, 120, 70, 0.4);
  background: transparent;
  color: rgba(220, 200, 160, 0.7);
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
}
.panel-close:hover {
  background: rgba(150, 120, 70, 0.2);
  color: #e8d5a0;
}

.slot-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.slot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(30, 24, 16, 0.6);
  border: 1px solid rgba(150, 120, 70, 0.35);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.18s ease;
}
.slot:hover {
  border-color: rgba(200, 170, 110, 0.6);
  background: rgba(40, 32, 20, 0.7);
}
.slot-empty {
  justify-content: center;
  border-style: dashed;
  border-color: rgba(100, 80, 50, 0.25);
  cursor: default;
}
.slot-empty:hover {
  border-color: rgba(100, 80, 50, 0.25);
  background: rgba(30, 24, 16, 0.6);
}
.slot-empty-icon {
  font-size: 11px;
  color: rgba(120, 100, 70, 0.35);
  letter-spacing: 2px;
}

.slot-icon {
  font-size: 1.6rem;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}
.slot-name {
  flex: 1;
  font-size: 14px;
  color: #e8d5a0;
  letter-spacing: 1px;
}
.slot-cat {
  font-size: 11px;
  color: rgba(180, 160, 130, 0.6);
}
.slot-unequip {
  width: 22px;
  height: 22px;
  border: 1px solid rgba(150, 120, 70, 0.4);
  background: rgba(40, 30, 18, 0.7);
  color: rgba(220, 190, 120, 0.7);
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}
.slot-unequip:hover:not(:disabled) {
  background: rgba(150, 120, 70, 0.3);
  color: #e8d5a0;
}
.slot-unequip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.panel-hint {
  padding: 8px 16px 14px;
  font-size: 11px;
  color: rgba(160, 140, 110, 0.5);
  line-height: 1.5;
}

/* tooltip */
.tip-name {
  font-size: 14px;
  color: #e8d5a0;
  margin-bottom: 4px;
}
.tip-stat {
  font-size: 12px;
  color: #7fd4c4;
  margin-bottom: 2px;
}
.tip-effect {
  font-size: 12px;
  color: #ffd97a;
  margin-bottom: 2px;
}
.tip-desc {
  font-size: 11px;
  color: rgba(190, 175, 145, 0.85);
  line-height: 1.5;
  word-break: break-all;
}
</style>
