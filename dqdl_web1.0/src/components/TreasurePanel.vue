<script setup>
/**
 * 宝物面板（独立弹窗，功能栏"宝物"按钮触发）。
 * 风格对齐 SkillPanel：player.png 边框 + 横向 5 格装备槽 + 下方可装备列表。
 *
 * 上方：5 格装备槽（已装备的宝物，只显示 emoji 图标 + tooltip，右键卸下）
 * 下方：背包中的宝物物品列表（点击装备到空槽位）
 *
 * Props / Emits 与 SkillPanel 同模式。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'
import { useBackpackStore } from '../stores/backpack'
import { bus, BusEvents } from '../utils/eventBus'
import { useItem, unequipTreasure } from '../api'
import { getAllTreasures } from '../api/treasure'
import FloatingTooltip from './FloatingTooltip.vue'

const props = defineProps({
  modelValue: Boolean,
  player: { type: Object, default: null },
  pos: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:pos'])

const { z, focus, mount, unmount } = usePanelStack('treasure')
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

/* ---- 背包 store ---- */
const backpackStore = useBackpackStore()

/* ---- treasure 定义缓存（item_id → 定义，tooltip 显示属性用） ---- */
const treasureDefs = ref({})
const parseJson = (s) => { try { return JSON.parse(s) } catch { return {} } }

watch(
  () => props.modelValue,
  async (v) => {
    if (v) {
      mount(); focus()
      // 打开时拉一次 treasure 定义
      try {
        const list = await getAllTreasures()
        const map = {}
        for (const t of (list || [])) {
          map[t.item_id] = {
            name: t.name,
            item_id: t.item_id,
            category: t.category,
            description: t.description,
            stats: parseJson(t.stats),
            effects: parseJson(t.effects),
          }
        }
        treasureDefs.value = map
      } catch (e) { /* 忽略 */ }
    } else unmount()
  },
)

/* ---- 已装备宝物：按 slot 索引 ---- */
function slotTreasure(slot) {
  const list = props.player?.treasures
  if (!Array.isArray(list)) return null
  return list.find((t) => Number(t.slot) === slot) || null
}

/* ---- 背包中的宝物物品（可装备） ---- */
const backpackTreasures = computed(() => {
  return backpackStore.slots.filter((s) => s.item?.type === '宝物')
})

/** 背包宝物是否已装备（同名宝物不重复显示在列表——实际上宝物每件独立，都显示） */
function isEquipped(item_id) {
  // 简单：都显示，玩家可以装备多件同类（受 unique_cat_max 约束）
  return false
}

/* ---- 装备/卸下 ---- */
const equipping = ref(false)
async function onEquip(bpItem) {
  if (equipping.value || !props.player?.id) return
  equipping.value = true
  try {
    const res = await useItem(props.player.id, bpItem.item_id)
    if (res?.player) {
      bus.emit(BusEvents.PLAYER_UPDATE, { player: res.player })
      await backpackStore.load(props.player.id)
      bus.emit(BusEvents.TOAST, { type: 'success', message: `装备了 ${bpItem.item?.name || '宝物'}` })
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '装备失败' })
  } finally {
    equipping.value = false
  }
}

async function onUnequip(slot) {
  if (equipping.value || !props.player?.id) return
  equipping.value = true
  try {
    const res = await unequipTreasure(props.player.id, slot)
    if (res?.player) {
      bus.emit(BusEvents.PLAYER_UPDATE, { player: res.player })
      await backpackStore.load(props.player.id)
      bus.emit(BusEvents.TOAST, { type: 'success', message: '已卸下宝物' })
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '卸下失败' })
  } finally {
    equipping.value = false
  }
}

/* ---- tooltip ---- */
const tipOpen = ref(false)
const tipData = ref(null)
const hoveredEl = ref(null)
const FALLBACK_ICON = '/icon/technique/bw-001.png'

/** 宝物图标路径：按 item_id（bw- 前缀）→ /icon/technique/{item_id}.png */
function treasureIconUrl(t) {
  const id = t?.item_id
  if (id && id.startsWith('bw-')) return `/icon/technique/${id}.png`
  return FALLBACK_ICON
}

function showTip(t, e) {
  if (!t) return
  hoveredEl.value = e.currentTarget
  tipData.value = t
  tipOpen.value = true
}
function hideTip() {
  tipOpen.value = false
}

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

function onIconError(e) {
  if (e.target.src !== FALLBACK_ICON) e.target.src = FALLBACK_ICON
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
    <!-- 顶部拖拽手柄条 -->
    <div
      class="drag-handle"
      @pointerdown.stop="onHandlePointerDown"
    >
      <span class="panel-title">宝物</span>
      <button
        class="close-btn"
        type="button"
        @click="close"
      >×</button>
    </div>

    <div class="panel-inner">
      <!-- 装备槽：横向 5 格 -->
      <div class="slots-section">
        <div class="section-label">装备栏（右键卸下）</div>
        <div class="slots-row">
          <div
            v-for="slot in 5"
            :key="slot"
            class="equip-slot"
            :class="{ occupied: slotTreasure(slot) }"
            @contextmenu.prevent="slotTreasure(slot) && onUnequip(slot)"
            @pointerenter="slotTreasure(slot) && showTip(slotTreasure(slot), $event)"
            @pointerleave="hideTip"
          >
            <template v-if="slotTreasure(slot)">
              <img
                class="slot-icon-img"
                :src="treasureIconUrl(slotTreasure(slot))"
                :alt="slotTreasure(slot).name || ''"
                @error="onIconError"
              >
            </template>
            <template v-else>
              <span class="slot-num">{{ slot }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 可装备列表（背包中的宝物，图标格，右键装备） -->
      <div class="inventory-section">
        <div class="section-label">背包宝物（右键装备）</div>
        <div
          v-if="backpackTreasures.length"
          class="inventory-grid"
        >
          <div
            v-for="bp in backpackTreasures"
            :key="bp.item_id"
            class="inv-slot"
            @contextmenu.prevent="onEquip(bp)"
            @pointerenter="showTip(treasureDefs[bp.item_id] || { name: bp.item?.name, item_id: bp.item_id, description: bp.item?.description, stats: {}, effects: {} }, $event)"
            @pointerleave="hideTip"
          >
            <img
              class="inv-slot-icon"
              :src="treasureIconUrl({ item_id: bp.item_id })"
              :alt="bp.item?.name || ''"
              @error="onIconError"
            >
            <span
              v-if="bp.count > 1"
              class="inv-slot-count"
            >{{ bp.count }}</span>
          </div>
        </div>
        <div
          v-else
          class="empty-hint"
        >背包中暂无宝物</div>
      </div>
    </div>

    <!-- tooltip -->
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
/* ========== 面板外壳（暗金背景，对齐 TaskPanel） ========== */
.treasure-panel {
  position: absolute;
  right: 20px;
  bottom: 80px;
  width: 440px;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid rgba(180, 150, 90, 0.45);
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.96), rgba(14, 11, 8, 0.98));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.drag-handle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(150, 120, 70, 0.25);
  background: rgba(40, 30, 18, 0.5);
  cursor: move;
  z-index: 1;
}
.panel-title {
  font-size: 16px;
  color: #e8d5a0;
  letter-spacing: 3px;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
}
.close-btn {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(150, 120, 70, 0.4);
  background: transparent;
  color: rgba(220, 200, 160, 0.7);
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  font-family: inherit;
}
.close-btn:hover {
  background: rgba(150, 120, 70, 0.2);
  color: #e8d5a0;
}
.panel-inner {
  position: relative;
  z-index: 1;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ========== 装备槽 ========== */
.section-label {
  font-size: 12px;
  color: rgba(200, 170, 110, 0.6);
  margin-bottom: 6px;
  letter-spacing: 1px;
}
.slots-row {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.equip-slot {
  width: 56px;
  height: 56px;
  border: 1px solid rgba(150, 120, 70, 0.3);
  background: rgba(20, 16, 10, 0.5);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.18s ease;
}
.equip-slot.occupied {
  border-color: rgba(200, 170, 110, 0.6);
  background: rgba(40, 30, 18, 0.6);
}
.equip-slot:hover {
  border-color: rgba(220, 190, 120, 0.8);
  background: rgba(50, 38, 22, 0.7);
}
.slot-icon-img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6));
}
.slot-num {
  font-size: 14px;
  color: rgba(120, 100, 70, 0.4);
}

/* ========== 可装备列表 ========== */
.inventory-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.inv-slot {
  position: relative;
  width: 48px;
  height: 48px;
  border: 1px solid rgba(150, 120, 70, 0.35);
  background: rgba(20, 16, 10, 0.5);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.18s ease;
}
.inv-slot:hover {
  border-color: rgba(220, 190, 120, 0.8);
  background: rgba(50, 38, 22, 0.7);
}
.inv-slot-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
}
.inv-slot-count {
  position: absolute;
  right: 2px;
  bottom: 1px;
  font-size: 11px;
  color: rgba(220, 200, 160, 0.8);
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}
.empty-hint {
  text-align: center;
  font-size: 12px;
  color: rgba(150, 130, 100, 0.4);
  padding: 12px;
}

/* ========== tooltip ========== */
.tip-name { font-size: 14px; color: #e8d5a0; margin-bottom: 4px; }
.tip-stat { font-size: 12px; color: #7fd4c4; margin-bottom: 2px; }
.tip-effect { font-size: 12px; color: #ffd97a; margin-bottom: 2px; }
.tip-desc { font-size: 11px; color: rgba(190,175,145,0.85); line-height: 1.5; word-break: break-all; }
</style>
