<script setup>
/**
 * 斗技弹窗（RPG 风格）：右下角功能栏「斗技」按钮触发。
 *
 * 布局：顶部 5 个装备槽（1~5），下方为已习得斗技列表（未装备）。
 * 交互（沿用老版本 SkillPanel 语义，carry=1~5 表装备槽位）：
 *   - 点击列表项 → 装入第一个空槽位；无空位则提示。
 *   - 拖拽列表项 → 落到指定槽位（覆盖原槽位）。
 *   - 右键装备槽 → 卸下。
 *   - hover 列表项 / 装备槽 → 浮层显示斗技详情。
 *
 * 数据：player.skills（后端 findOne 聚合，含 name/attr/rank/carry/max_cultivation 等）。
 * 装配改动本地乐观更新 player.skills 与 player.skill 原始串，并 POST /player/:id/skill 持久化。
 *
 * Props:
 *   modelValue (boolean) - 是否显示
 *   player    (object)   - 玩家完整数据（findOne 聚合返回）
 *   pos       (object)   - 弹窗位置（受控）
 * Emits:
 *   update:modelValue / update:pos
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'
import FloatingTooltip from './FloatingTooltip.vue'
import { updatePlayerSkills } from '../api'
import { bus, BusEvents } from '../utils/eventBus'

const props = defineProps({
  modelValue: Boolean,
  player: { type: Object, default: null },
  /** 弹窗位置（受控）：null = 沿用 CSS 默认定位（右下）；{x,y} = 显式左上坐标 */
  pos: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:pos'])

/* ============ 弹窗层级 + 拖拽 ============ */
const { z, focus, mount, unmount } = usePanelStack('skill')
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

/* ============ 斗技数据（后端聚合数组） ============ */
const skills = computed(() => props.player?.skills || [])
/** carry=1~5 的进装备映射 */
const equippedMap = computed(() => {
  const map = {}
  skills.value.forEach((s) => {
    if (s.carry >= 1 && s.carry <= 5) map[s.carry] = s
  })
  return map
})
/** 未装备的斗技列表 */
const inventoryList = computed(() => skills.value.filter((s) => !s.carry))
function slotSkill(slot) {
  return equippedMap.value[slot] || null
}

/* ============ 文本格式化 ============ */
const RANK_LABEL = {
  11: '天阶上品', 12: '天阶中品', 13: '天阶下品',
  21: '地阶上品', 22: '地阶中品', 23: '地阶下品',
  31: '玄阶上品', 32: '玄阶中品', 33: '玄阶下品',
  41: '黄阶上品', 42: '黄阶中品', 43: '黄阶下品',
}
function rankLabel(rank) {
  return RANK_LABEL[rank] || ''
}
const ATTR_LABEL = { power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质' }
function attrLabel(a) {
  return ATTR_LABEL[a] || a || ''
}

/** 斗技图标：dj- 前缀 → /icon/skill/{item_id}.png；缺失用兜底图 */
const FALLBACK_ICON = '/icon/cl/cl-100.png'
function skillIconUrl(s) {
  const id = s?.item_id
  if (id && id.startsWith('dj-')) {
    return `/icon/skill/${id}.png`
  }
  return FALLBACK_ICON
}
function onIconError(e) {
  if (e.target.src !== FALLBACK_ICON) e.target.src = FALLBACK_ICON
}

/* ============ 悬浮 tooltip（列表 + 装备槽共享一个浮层实例） ============ */
const hoveredEl = ref(null)
const hoveredData = ref(null)
const tipOpen = ref(false)
function showTip(s, e) {
  hoveredEl.value = e.currentTarget
  hoveredData.value = s
  tipOpen.value = true
}
function hideTip() {
  tipOpen.value = false
}

/* ============ 装配 / 卸下（本地乐观更新 + 持久化） ============
   carry 改动只改 player.skills[].carry 与 player.skill 原始串，
   不触发整份 player 重拉（避免页面其他面板闪烁）。 */
function parseRaw(raw) {
  try {
    const a = JSON.parse(raw || '[]')
    return Array.isArray(a) ? a : []
  } catch {
    return []
  }
}

/** 点击装备：装入第一个空槽位（1-5）；无空位则提示。 */
function onEquip(s) {
  const used = new Set(
    skills.value.filter((x) => x.carry >= 1 && x.carry <= 5).map((x) => x.carry),
  )
  const free = [1, 2, 3, 4, 5].find((sl) => !used.has(sl))
  if (!free) {
    bus.emit(BusEvents.TOAST, { type: 'info', message: '斗技栏已满（5/5），请先卸下' })
    return
  }
  applyCarryChange((raw) => {
    const t = raw.find((x) => x.id === s.id)
    if (t) t.carry = free
  })
}

function onDragStart(s, e) {
  e.dataTransfer.setData('text/plain', String(s.id))
  e.dataTransfer.effectAllowed = 'move'
}

function onDropSlot(slot, e) {
  e.preventDefault()
  const id = Number(e.dataTransfer.getData('text/plain'))
  if (!id) return
  applyCarryChange((raw) => {
    // 先清掉该斗技原槽位，再清掉目标槽位的旧主，最后落到目标槽
    raw.forEach((x) => {
      if (x.id === id) delete x.carry
    })
    raw.forEach((x) => {
      if (x.carry === slot) delete x.carry
    })
    const t = raw.find((x) => x.id === id)
    if (t) t.carry = slot
  })
}

function onRightClickSlot(slot) {
  applyCarryChange((raw) => {
    const t = raw.find((x) => x.carry === slot)
    if (t) delete t.carry
  })
}

/** 应用 carry 变更：改原始 JSON 串 → 本地同步 skills[].carry → POST 持久化 */
async function applyCarryChange(mutate) {
  if (!props.player) return
  const raw = parseRaw(props.player.skill)
  mutate(raw)
  // 本地同步富化数组里对应斗技的 carry，避免重新拉取
  const carryById = new Map(raw.map((x) => [x.id, x.carry ?? null]))
  props.player.skills = skills.value.map((s) => ({
    ...s,
    carry: carryById.has(s.id) ? carryById.get(s.id) : null,
  }))
  props.player.skill = JSON.stringify(raw)
  try {
    await updatePlayerSkills(props.player.id, props.player.skill)
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '保存斗技失败' })
  }
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <div
    v-if="modelValue"
    ref="panelRef"
    class="skill-panel"
    :class="{ 'is-dragging': dragging }"
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
    @pointerdown="focus"
  >
    <!-- 边框背景图（沿用 player.png 风格） -->
    <img
      class="panel-frame"
      src="/player/player.png"
      alt=""
    >

    <!-- 顶部拖拽手柄条 -->
    <div
      class="drag-handle"
      title="拖拽移动"
      @pointerdown.stop="onHandlePointerDown"
    />

    <!-- 关闭按钮 -->
    <button
      class="close-btn"
      type="button"
      title="关闭"
      @click="close"
    >
      ×
    </button>

    <div class="panel-title">
      斗技
    </div>

    <!-- 内容区 -->
    <div class="panel-inner">
      <!-- 装备槽 -->
      <div class="slots-section">
        <div class="section-label">
          装备栏（右键卸下）
        </div>
        <div class="slots-row">
          <div
            v-for="slot in 5"
            :key="slot"
            class="equip-slot"
            :class="{ occupied: slotSkill(slot) }"
            @dragover.prevent
            @drop="onDropSlot(slot, $event)"
            @contextmenu.prevent="onRightClickSlot(slot)"
            @pointerenter="slotSkill(slot) && showTip(slotSkill(slot), $event)"
            @pointerleave="hideTip"
          >
            <template v-if="slotSkill(slot)">
              <img
                class="slot-icon"
                :src="skillIconUrl(slotSkill(slot))"
                :alt="slotSkill(slot).name || ''"
                @error="onIconError"
              >
              <span class="slot-lv">Lv.{{ slotSkill(slot).level ?? 1 }}</span>
            </template>
            <template v-else>
              <span class="slot-num">{{ slot }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- 已习得列表 -->
      <div class="inventory-section">
        <div class="section-label">
          已习得（点击或拖拽装配）
        </div>
        <div
          v-if="inventoryList.length"
          class="inventory-grid"
        >
          <div
            v-for="s in inventoryList"
            :key="s.id"
            class="skill-card"
            draggable="true"
            title="点击装备到空槽位，或拖拽到指定槽位"
            @click="onEquip(s)"
            @dragstart="onDragStart(s, $event)"
            @pointerenter="showTip(s, $event)"
            @pointerleave="hideTip"
          >
            <img
              class="card-icon"
              :src="skillIconUrl(s)"
              :alt="s.name || ''"
              @error="onIconError"
            >
            <div class="card-info">
              <div class="card-name">
                {{ s.name || '未知斗技' }}
              </div>
              <div class="card-meta">
                {{ rankLabel(s.rank) }}<template v-if="rankLabel(s.rank)">
                  ·
                </template>{{ attrLabel(s.attr) }}
              </div>
            </div>
            <span class="card-lv">Lv.{{ s.level ?? 1 }}</span>
          </div>
        </div>
        <div
          v-else
          class="empty-hint"
        >
          所有斗技均已装备
        </div>
      </div>
    </div>

    <!-- 悬浮详情：装备槽 + 列表共享一个浮层，Teleport 到 body -->
    <FloatingTooltip
      v-model:open="tipOpen"
      :reference="hoveredEl"
      placement="right-start"
    >
      <div class="tip-name">
        {{ hoveredData?.name || '未知斗技' }}
        <span
          v-if="hoveredData?.rank"
          class="tip-rank"
        >{{ rankLabel(hoveredData.rank) }}</span>
      </div>
      <div
        v-if="hoveredData?.attr"
        class="tip-meta"
      >
        {{ attrLabel(hoveredData.attr) }}属性 · 耗气 {{ hoveredData.energy_cost ?? 0 }}
      </div>
      <div
        v-if="hoveredData?.max_level"
        class="tip-progress"
      >
        Lv.{{ hoveredData.level ?? 1 }}/{{ hoveredData.max_level }}
        · 修为 {{ hoveredData.cultivation ?? 0 }}/{{ hoveredData.max_cultivation || 0 }}
      </div>
      <div
        v-if="hoveredData?.description"
        class="tip-desc"
      >
        {{ hoveredData.description }}
      </div>
    </FloatingTooltip>
  </div>
</template>

<style scoped>
/* ========== 面板外壳 ========== */
.skill-panel {
  position: absolute;
  right: 14px;
  bottom: 84px;
  z-index: 50;
  width: 520px;
  height: 460px;
  filter: drop-shadow(0 8px 24px rgba(0, 0, 0, 0.7));
}

.panel-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  user-select: none;
}

/* 顶部拖拽手柄条 */
.drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 28px;
  z-index: 2;
  cursor: move;
  user-select: none;
  -webkit-user-select: none;
}
.skill-panel.is-dragging {
  user-select: none;
  -webkit-user-select: none;
}

.close-btn {
  position: absolute;
  top: 7px;
  right: 9px;
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

.panel-title {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  font-size: 16px;
  letter-spacing: 4px;
  color: #f0d896;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}

/* ========== 内容流式布局 ========== */
.panel-inner {
  position: absolute;
  inset: 55px 55px 40px 55px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-label {
  font-size: 11px;
  letter-spacing: 3px;
  color: #d4b070;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  margin-bottom: 6px;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}

/* ---------- 装备槽 ---------- */
.slots-section {
  flex: 0 0 auto;
}
.slots-row {
  display: flex;
  gap: 8px;
}
.equip-slot {
  position: relative;
  flex: 1;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 6, 4, 0.75);
  border: 1px solid rgba(120, 100, 60, 0.3);
  border-radius: 4px;
  transition: border-color 0.15s, background 0.15s;
}
.equip-slot.occupied {
  background: rgba(20, 16, 10, 0.85);
  border-color: rgba(160, 130, 70, 0.45);
  cursor: pointer;
}
.equip-slot.occupied:hover {
  border-color: rgba(220, 190, 120, 0.7);
  background: rgba(30, 24, 14, 0.9);
}
.slot-icon {
  width: 80%;
  height: 80%;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  pointer-events: none;
}
.slot-lv {
  position: absolute;
  right: 2px;
  bottom: 0;
  font-size: 9px;
  color: #9fc880;
  letter-spacing: 0.5px;
  font-family: 'Georgia', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
}
.slot-num {
  font-size: 16px;
  color: rgba(200, 170, 110, 0.3);
  font-family: 'Georgia', serif;
}

/* ---------- 已习得列表 ---------- */
.inventory-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.inventory-grid {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-right: 3px;
}
.inventory-grid::-webkit-scrollbar {
  width: 3px;
}
.inventory-grid::-webkit-scrollbar-thumb {
  background: rgba(180, 150, 90, 0.3);
  border-radius: 2px;
}
.skill-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background: linear-gradient(180deg, rgba(45, 34, 20, 0.8), rgba(28, 22, 14, 0.8));
  border: 1px solid rgba(160, 130, 70, 0.45);
  border-radius: 4px;
  cursor: grab;
  transition: border-color 0.15s, background 0.15s;
}
.skill-card:hover {
  border-color: rgba(220, 190, 120, 0.7);
  background: linear-gradient(180deg, rgba(55, 42, 26, 0.9), rgba(38, 30, 20, 0.9));
}
.card-icon {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  pointer-events: none;
}
.card-info {
  flex: 1;
  min-width: 0;
}
.card-name {
  font-size: 12px;
  color: #ecd9a8;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-meta {
  font-size: 10px;
  color: rgba(200, 170, 110, 0.7);
}
.card-lv {
  flex: 0 0 auto;
  font-size: 11px;
  color: #9fc880;
  letter-spacing: 1px;
  font-family: 'Georgia', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}

.empty-hint {
  font-size: 10px;
  letter-spacing: 1px;
  color: rgba(200, 170, 110, 0.4);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-align: center;
  padding: 20px 0;
}

/* ========== 浮层内容样式（Teleport 到 body，class 仍匹配） ========== */
.tip-name {
  font-size: 13px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  margin-bottom: 4px;
}
.tip-rank {
  font-size: 10px;
  color: #c0a060;
  margin-left: 5px;
  font-weight: normal;
}
.tip-meta {
  font-size: 10px;
  color: rgba(210, 180, 120, 0.8);
  margin-bottom: 3px;
}
.tip-progress {
  font-size: 10px;
  color: rgba(200, 170, 110, 0.7);
  margin-bottom: 3px;
}
.tip-desc {
  font-size: 10px;
  line-height: 1.5;
  color: rgba(190, 175, 145, 0.85);
  word-break: break-all;
}
</style>
