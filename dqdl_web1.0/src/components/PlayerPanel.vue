<script setup>
/**
 * 角色面板弹窗：功能栏"角色"按钮触发。
 * 左右布局（约 4:6）：左侧立绘 + 底部铭牌（姓名/等阶），右侧属性/进度/功法/斗技。
 * 边框背景用 player.png；内部内容用 flex 流式排布（非绝对定位），分区用卡片块。
 *
 * Props:
 *   modelValue (boolean) - 是否显示
 *   player    (object)   - 玩家完整数据（findOne 聚合返回）
 * Emits:
 *   update:modelValue - 关闭
 */
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'

const props = defineProps({
  modelValue: Boolean,
  player: { type: Object, default: null },
  /** 弹窗位置（受控）：null = 沿用 CSS 默认定位（右下）；{x,y} = 显式左上坐标 */
  pos: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:pos'])

/* ============ 弹窗层级（后打开/点击的在上） ============ */
const { z, focus, mount, unmount } = usePanelStack('player')
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

/* ============ 弹窗拖拽（顶部手柄条，覆盖边框装饰顶部留白） ============ */
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

/** 五维属性：色条 + 标签 + 字段名 */
const ATTRS = [
  { label: '力量', key: 'power', color: '#e85040' },
  { label: '智力', key: 'intelligence', color: '#4ab8e8' },
  { label: '敏捷', key: 'quick', color: '#8ae870' },
  { label: '体质', key: 'stamina', color: '#e8a840' },
  { label: '运气', key: 'lucky', color: '#c8a0e8' },
]

/** final_attrs 优先（含功法/宝物加成），fallback 到 player 本身 */
function attrVal(key) {
  const fa = props.player?.final_attrs
  return fa?.[key] ?? props.player?.[key] ?? 0
}

/** 上限：final_attrs.max_hp/max_energy（突破后重算持久化） */
const maxHp = computed(() => props.player?.final_attrs?.max_hp ?? props.player?.max_hp ?? 1)
const maxEnergy = computed(() => props.player?.final_attrs?.max_energy ?? props.player?.max_energy ?? 1)
const maxCult = computed(() => props.player?.level_cultivation ?? 100)

const hpPct = computed(() => Math.min(100, ((props.player?.hp ?? 0) / Math.max(1, maxHp.value)) * 100))
const energyPct = computed(() => Math.min(100, ((props.player?.energy ?? 0) / Math.max(1, maxEnergy.value)) * 100))
const cultivationPct = computed(() => Math.min(100, ((props.player?.cultivation ?? 0) / Math.max(1, maxCult.value)) * 100))

/** 技能/功法（JSON 字符串解析） */
function parseList(raw) {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
const skills = computed(() => parseList(props.player?.skill))
const techniques = computed(() => parseList(props.player?.technique))

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <div
    v-if="modelValue"
    ref="panelRef"
    class="player-panel"
    :class="{ 'is-dragging': dragging }"
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
    @pointerdown="focus"
  >
    <!-- 边框背景图（绝对铺底，不参与流式布局） -->
    <img
      class="panel-frame"
      src="/player/player.png"
      alt=""
    >

    <!-- 顶部拖拽手柄条（覆盖边框顶部留白区，透明可点击） -->
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

    <div class="player-title">
      角色
    </div>

    <!-- 内容容器：flex 行流式布局，内边距由边框留白决定 -->
    <div class="panel-inner">
      <!-- 左侧：立绘 + 底部铭牌 -->
      <div class="portrait-col">
        <img
          class="character-art"
          src="/ui/boy.png"
          alt=""
        >
        <div
          v-if="player"
          class="name-plate"
        >
          <div class="char-name">{{ player.name }}</div>
          <div class="char-title">{{ player.level_name || ('Lv.' + player.level) }}</div>
        </div>
      </div>

      <!-- 右侧：属性面板（flex 列，各分区为卡片块） -->
      <div
        v-if="player"
        class="stats-col"
      >
        <!-- 生命/斗气/修为 -->
        <section class="card">
          <div class="vital-row">
            <span class="vital-label">气血</span>
            <div class="vital-track">
              <div
                class="vital-fill hp"
                :style="{ width: hpPct + '%' }"
              />
              <span class="vital-text">{{ player.hp }} / {{ maxHp }}</span>
            </div>
          </div>
          <div class="vital-row">
            <span class="vital-label">斗气</span>
            <div class="vital-track">
              <div
                class="vital-fill energy"
                :style="{ width: energyPct + '%' }"
              />
              <span class="vital-text">{{ player.energy }} / {{ maxEnergy }}</span>
            </div>
          </div>
          <div class="vital-row">
            <span class="vital-label">修为</span>
            <div class="vital-track">
              <div
                class="vital-fill cult"
                :style="{ width: cultivationPct + '%' }"
              />
              <span class="vital-text">{{ player.cultivation }} / {{ maxCult }}</span>
            </div>
          </div>
        </section>

        <!-- 五维属性（竖向列表行） -->
        <section class="card">
          <h4 class="card-title">资质</h4>
          <div class="attr-rows">
            <div
              v-for="a in ATTRS"
              :key="a.key"
              class="attr-row"
            >
              <span
                class="attr-accent"
                :style="{ background: a.color }"
              />
              <span class="attr-name">{{ a.label }}</span>
              <span
                class="attr-value"
                :style="{ color: a.color }"
              >{{ attrVal(a.key) }}</span>
            </div>
          </div>
        </section>

        <!-- 功法 -->
        <section class="card">
          <h4 class="card-title">功法</h4>
          <div
            v-if="techniques.length"
            class="tag-list"
          >
            <span
              v-for="(t, i) in techniques"
              :key="'t'+i"
              class="tag"
            >{{ t.name || t.skill_name || '未知' }}</span>
          </div>
          <span
            v-else
            class="empty-hint"
          >— 尚未习得 —</span>
        </section>

        <!-- 斗技 -->
        <section class="card">
          <h4 class="card-title">斗技</h4>
          <div
            v-if="skills.length"
            class="tag-list"
          >
            <span
              v-for="(s, i) in skills"
              :key="'s'+i"
              class="tag"
            >{{ s.name || s.skill_name || '未知' }}</span>
          </div>
          <span
            v-else
            class="empty-hint"
          >— 尚未习得 —</span>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ========== 面板外壳：固定尺寸，player.png 绝对铺底 ========== */
.player-panel {
  position: absolute;
  right: 14px;
  bottom: 84px;
  z-index: 50;
  width: 600px;
  height: 450px;
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

/* 顶部拖拽手柄条：覆盖边框顶部留白，透明可点击（不挡关闭按钮） */
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
/* 拖拽中禁止内部选区/误触 */
.player-panel.is-dragging {
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

.player-title{
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 3;
  font-size: 16px;
  letter-spacing: 4px;
  color: #f0d896;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* ========== 内容流式布局：行方向，左立绘右属性 ========== */
.panel-inner {
  position: absolute;
  /* 留出 player.png 边框装饰的留白 */
  inset: 60px 55px 45px 55px;
  z-index: 2;
  display: flex;
  gap: 14px;
}

/* ---------- 左：立绘列 ---------- */
.portrait-col {
  flex: 0 0 38%; /* 4:6 中的"4" */
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(18, 13, 8, 0.35), rgba(8, 6, 4, 0.65));
  border: 1px solid rgba(140, 110, 60, 0.25);
}

.character-art {
  flex: 1;
  width: 100%;
  min-height: 0; /* 让 flex 子项可缩放 */
  object-fit: cover;
  object-position: bottom center;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
}

/* 立绘底部铭牌：渐变压暗 + 姓名/等阶 */
.name-plate {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20px 10px 8px;
  text-align: center;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.85) 100%);
}
.char-name {
  font-size: 17px;
  letter-spacing: 3px;
  color: #f0d896;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
}
.char-title {
  margin-top: 2px;
  font-size: 11px;
  letter-spacing: 2px;
  color: #9fc880;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

/* ---------- 右：属性列（纵向卡片流） ---------- */
.stats-col {
  flex: 1; /* 占剩余宽度 */
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}
.stats-col::-webkit-scrollbar {
  width: 3px;
}
.stats-col::-webkit-scrollbar-thumb {
  background: rgba(180, 150, 90, 0.3);
  border-radius: 2px;
}

/* 卡片块：统一容器样式，形成视觉分区 */
.card {
  padding: 7px 10px;
  background: linear-gradient(180deg, rgba(30, 22, 14, 0.55), rgba(16, 12, 7, 0.55));
  border: 1px solid rgba(140, 110, 60, 0.22);
  border-radius: 4px;
}

.card-title {
  margin: 0 0 6px;
  padding-bottom: 4px;
  font-size: 11px;
  font-weight: normal;
  letter-spacing: 3px;
  color: #d4b070;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  border-bottom: 1px solid rgba(140, 110, 60, 0.2);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}

/* ---------- 进度条行 ---------- */
.vital-row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 20px;
}
.vital-row + .vital-row {
  margin-top: 3px;
}
.vital-label {
  flex: 0 0 28px;
  font-size: 11px;
  color: rgba(210, 180, 120, 0.85);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}
.vital-track {
  flex: 1;
  position: relative;
  height: 14px;
  background: rgba(6, 4, 3, 0.85);
  border: 1px solid rgba(120, 100, 60, 0.3);
  border-radius: 7px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.6);
}
.vital-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 7px;
  transition: width 0.3s ease;
}
.vital-fill.hp {
  background: linear-gradient(180deg, #ee5a48, #b8312b);
}
.vital-fill.energy {
  background: linear-gradient(180deg, #56c4f0, #2a88c0);
}
.vital-fill.cult {
  background: linear-gradient(180deg, #c98ce0, #8b4bb0);
}
.vital-text {
  position: absolute;
  z-index: 1;
  width: 100%;
  text-align: center;
  font-size: 9px;
  line-height: 14px;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}

/* ---------- 五维属性：竖向列表行 ---------- */
.attr-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.attr-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  border-radius: 3px;
  transition: background 0.15s;
}
.attr-row:hover {
  background: rgba(140, 110, 60, 0.1);
}
.attr-accent {
  flex: 0 0 3px;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  box-shadow: 0 0 4px currentColor;
}
.attr-name {
  flex: 1;
  font-size: 12px;
  color: rgba(220, 200, 170, 0.85);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}
.attr-value {
  flex: 0 0 auto;
  min-width: 36px;
  text-align: right;
  font-size: 15px;
  font-weight: bold;
  font-family: 'Georgia', serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}

/* ---------- 功法/斗技标签 ---------- */
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.tag {
  font-size: 11px;
  padding: 2px 9px;
  color: #ecd9a8;
  background: linear-gradient(180deg, rgba(45, 34, 20, 0.8), rgba(28, 22, 14, 0.8));
  border: 1px solid rgba(160, 130, 70, 0.45);
  border-radius: 10px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}
.empty-hint {
  font-size: 10px;
  letter-spacing: 1px;
  color: rgba(200, 170, 110, 0.4);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
</style>
