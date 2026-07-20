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
import { bus, BusEvents } from '../utils/eventBus'
import { breakthrough, unequipTreasure } from '../api'
import TechniqueTooltip from './TechniqueTooltip.vue'
import FloatingTooltip from './FloatingTooltip.vue'

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

/** 斗技（JSON 字符串解析） */
function parseList(raw) {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
/** 斗技：优先用后端聚合的 skills 详情数组（含 name/item_id/carry 等），兼容旧 JSON 字符串 */
const skills = computed(() => {
  const agg = props.player?.skills
  if (Array.isArray(agg) && agg.length) return agg
  return parseList(props.player?.skill)
})
/** 角色面板只展示已装备的斗技（carry 1~5） */
const equippedSkills = computed(() =>
  skills.value.filter((s) => s.carry >= 1 && s.carry <= 5),
)

/**
 * 功法：优先用后端聚合的 techniques 详情数组（含 name/item_id/level/max_cultivation 等），
 * 兼容旧的 technique JSON 字符串（仅有 id/name）。后者无 name 时前端兜底显示「未知」。
 */
const techniques = computed(() => {
  const agg = props.player?.techniques
  if (Array.isArray(agg) && agg.length) return agg
  return parseList(props.player?.technique)
})
/** 角色面板只展示已装备的功法（至多 1 部，与下方已装备斗技对称）；完整管理在功法/斗技弹窗 */
const equippedTechniques = computed(() => techniques.value.filter((t) => t.equipped))

/**
 * 宝物：用后端聚合的 treasures 详情数组（含 name/category/rank/stats/effects）。
 * 后端 findOne 已下发完整定义，前端直接按 slot 排序展示。
 */
const equippedTreasures = computed(() => {
  const list = props.player?.treasures
  if (Array.isArray(list) && list.length) {
    return [...list].sort((a, b) => (a.slot || 0) - (b.slot || 0))
  }
  return []
})

/** 宝物属性/效果文案（tooltip 用） */
const ATTR_LABEL = { power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质', lucky: '运气', hp: '生命', energy: '斗气' }
const EFFECT_LABEL = { cultivation_efficiency: '修炼效率' }
const EFFECT_UNIT = { cultivation_efficiency: '%' }
function treasureStatText(t) {
  const s = t?.stats || {}
  return Object.keys(s).map((k) => `${ATTR_LABEL[k] || k}+${s[k]}`).join(' ')
}
function treasureEffectText(t) {
  const e = t?.effects || {}
  return Object.keys(e).map((k) => `${EFFECT_LABEL[k] || k}+${e[k]}${EFFECT_UNIT[k] || ''}`).join(' ')
}
const TREASURE_FALLBACK = '/icon/technique/bw-001.png'
function treasureIconUrl(t) {
  const id = t?.item_id
  if (id && id.startsWith('bw-')) return `/icon/technique/${id}.png`
  return TREASURE_FALLBACK
}

/** 卸下宝物：调后端 unequip → 返回最新 player → emit PLAYER_UPDATE 整体刷新 */
const unequipping = ref(false)
async function doUnequipTreasure(slot) {
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

/** 图标兜底：缺失统一用 cl-100.png */
const FALLBACK_ICON = '/icon/cl/cl-100.png'

/** 功法图标路径：按 item_id 前缀路由。gf- 前缀 → /icon/technique/{item_id}.png */
function techniqueIconUrl(t) {
  const id = t?.item_id
  if (id && id.startsWith('gf-')) return `/icon/technique/${id}.png`
  return FALLBACK_ICON
}

/** 斗技图标路径：dj- 前缀 → /icon/skill/{item_id}.png */
function skillIconUrl(s) {
  const id = s?.item_id
  if (id && id.startsWith('dj-')) return `/icon/skill/${id}.png`
  return FALLBACK_ICON
}

function onIconError(e) {
  if (e.target.src !== FALLBACK_ICON) {
    e.target.src = FALLBACK_ICON
  }
}

/* ============ 斗技品阶/属性文本（供 tooltip 展示） ============ */
const SKILL_RANK_LABEL = {
  11: '天阶上品', 12: '天阶中品', 13: '天阶下品',
  21: '地阶上品', 22: '地阶中品', 23: '地阶下品',
  31: '玄阶上品', 32: '玄阶中品', 33: '玄阶下品',
  41: '黄阶上品', 42: '黄阶中品', 43: '黄阶下品',
}
const SKILL_ATTR_LABEL = { power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质' }
function skillRankLabel(rank) {
  return SKILL_RANK_LABEL[rank] || ''
}
function skillAttrLabel(a) {
  return SKILL_ATTR_LABEL[a] || a || ''
}

/* ============ 斗技 tooltip（已装备项共享一个 FloatingTooltip） ============ */
const skillTipEl = ref(null)
const skillTipData = ref(null)
const skillTipOpen = ref(false)
function onSkillEnter(e, s) {
  skillTipEl.value = e.currentTarget
  skillTipData.value = s
  skillTipOpen.value = true
}
function onSkillLeave() {
  skillTipOpen.value = false
}

/* ---- 宝物 tooltip（与斗技同模式） ---- */
const treasureTipData = ref(null)
const treasureTipOpen = ref(false)
const treasureHoveredEl = ref(null)
function onTreasureEnter(e, t) {
  treasureHoveredEl.value = e.currentTarget
  treasureTipData.value = t
  treasureTipOpen.value = true
}
function onTreasureLeave() {
  treasureTipOpen.value = false
}

/* ============ 突破 ============ */
const breaking = ref(false)
/** 修为是否已满（可突破） */
const canBreakthrough = computed(
  () => (props.player?.cultivation ?? 0) >= (props.player?.level_cultivation ?? 1),
)

/** 突破：调后端判定成功/失败，Toast 结果 + 通知 GameView 刷新玩家数据 */
async function onBreakthrough() {
  if (breaking.value || !canBreakthrough.value || !props.player?.id) return
  breaking.value = true
  try {
    const res = await breakthrough(props.player.id)
    if (res.breakthrough_success) {
      bus.emit(BusEvents.TOAST, { type: 'success', message: '突破成功！实力大增' })
    } else {
      bus.emit(BusEvents.TOAST, { type: 'error', message: '突破失败，修为倒退一半' })
    }
    // 通知 GameView 重新拉取玩家数据（突破会改 level/属性/cultivation）
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '突破失败' })
  } finally {
    breaking.value = false
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
          <div class="char-name">
            {{ player.name }}
          </div>
        </div>
      </div>

      <!-- 右侧：属性面板（flex 列，各分区为卡片块） -->
      <div
        v-if="player"
        class="stats-col"
      >
        <!-- 等阶名 + 突破按钮（flex 两侧布局） -->
        <div class="level-row">
          <span class="char-title">{{ player.level_name || ('Lv.' + player.level) }}</span>
          <button
            class="breakthrough-btn"
            type="button"
            :disabled="!canBreakthrough || breaking"
            @click="onBreakthrough"
          >
            {{ breaking ? '突破中...' : (canBreakthrough ? '突破' : '修为未满') }}
          </button>
        </div>

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
          <h4 class="card-title">
            基础属性
          </h4>
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

        <!-- 功法（仅显示已装备，至多一部；完整管理在功法/斗技弹窗） -->
        <section class="card">
          <h4 class="card-title">
            功法
          </h4>
          <div
            v-if="equippedTechniques.length"
            class="technique-list"
          >
            <TechniqueTooltip
              v-for="(t, i) in equippedTechniques"
              :key="'t'+i"
              :technique="t"
            >
              <div class="technique-item">
                <img
                  class="technique-icon"
                  :src="techniqueIconUrl(t)"
                  :alt="t.name || ''"
                  @error="onIconError"
                >
                <span class="technique-name">{{ t.name || t.skill_name || '未知' }}</span>
                <span class="technique-level">Lv.{{ t.level ?? 1 }}</span>
              </div>
            </TechniqueTooltip>
          </div>
          <span
            v-else
            class="empty-hint"
          >— 尚未装备 —</span>
        </section>

        <!-- 斗技（仅已装备 carry 1~5） -->
        <section class="card">
          <h4 class="card-title">
            斗技
          </h4>
          <div
            v-if="equippedSkills.length"
            class="technique-list"
          >
            <div
              v-for="(s, i) in equippedSkills"
              :key="'s'+i"
              class="technique-item"
              @pointerenter="onSkillEnter($event, s)"
              @pointerleave="onSkillLeave"
            >
              <img
                class="technique-icon"
                :src="skillIconUrl(s)"
                :alt="s.name || ''"
                @error="onIconError"
              >
              <span class="technique-name">{{ s.name || s.skill_name || '未知' }}</span>
              <span class="technique-level">Lv.{{ s.level ?? 1 }}</span>
            </div>
          </div>
          <span
            v-else
            class="empty-hint"
          >— 尚未装配 —</span>
        </section>

        <!-- 宝物（已装备，5 槽位；卸下后返还物品到背包） -->
        <section class="card">
          <h4 class="card-title">
            宝物
          </h4>
          <div
            v-if="equippedTreasures.length"
            class="technique-list treasure-list"
          >
            <div
              v-for="t in equippedTreasures"
              :key="'tr'+t.slot"
              class="technique-item treasure-item"
              @pointerenter="onTreasureEnter($event, t)"
              @pointerleave="onTreasureLeave"
            >
              <img
                class="treasure-icon"
                :src="treasureIconUrl(t)"
                :alt="t.name || ''"
                @error="onIconError"
              >
              <span class="technique-name">{{ t.name }}</span>
              <span class="technique-level">{{ t.category }}</span>
              <button
                class="treasure-unequip-btn"
                type="button"
                :disabled="unequipping"
                @click.stop="doUnequipTreasure(t.slot)"
              >卸</button>
            </div>
          </div>
          <span
            v-else
            class="empty-hint"
          >— 尚未装备 —</span>
        </section>
      </div>
    </div>

    <!-- 斗技 tooltip：已装备项共享一个浮层，Teleport 到 body -->
    <FloatingTooltip
      v-model:open="skillTipOpen"
      :reference="skillTipEl"
      placement="right-start"
    >
      <div class="skill-tip-name">
        {{ skillTipData?.name || '未知斗技' }}
        <span
          v-if="skillTipData && skillRankLabel(skillTipData.rank)"
          class="skill-tip-rank"
        >{{ skillRankLabel(skillTipData.rank) }}</span>
      </div>
      <div
        v-if="skillTipData && skillTipData.attr"
        class="skill-tip-meta"
      >
        {{ skillAttrLabel(skillTipData.attr) }}属性 · 耗气 {{ skillTipData.energy_cost ?? 0 }}
      </div>
      <div
        v-if="skillTipData && skillTipData.max_level"
        class="skill-tip-progress"
      >
        Lv.{{ skillTipData.level ?? 1 }}/{{ skillTipData.max_level }}
      </div>
      <div
        v-if="skillTipData && skillTipData.description"
        class="skill-tip-desc"
      >
        {{ skillTipData.description }}
      </div>
    </FloatingTooltip>

    <!-- 宝物 tooltip -->
    <FloatingTooltip
      v-model:open="treasureTipOpen"
      :reference="treasureHoveredEl"
      placement="right-start"
    >
      <div class="skill-tip-name">
        {{ treasureTipData?.name || '未知宝物' }}
        <span class="skill-tip-rank">{{ treasureTipData?.category }}</span>
      </div>
      <div
        v-if="treasureTipData && treasureStatText(treasureTipData)"
        class="skill-tip-meta"
      >
        {{ treasureStatText(treasureTipData) }}
      </div>
      <div
        v-if="treasureTipData && treasureEffectText(treasureTipData)"
        class="skill-tip-meta"
      >
        {{ treasureEffectText(treasureTipData) }}
      </div>
      <div
        v-if="treasureTipData && treasureTipData.description"
        class="skill-tip-desc"
      >
        {{ treasureTipData.description }}
      </div>
    </FloatingTooltip>
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
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  /* 标题是纯装饰文字，让出指针事件给下层的拖拽手柄（z-index 2），避免该区域无法拖动 */
  pointer-events: none;
}

/* ========== 内容流式布局：行方向，左立绘右属性 ========== */
.panel-inner {
  position: absolute;
  /* 留出 player.png 边框装饰的留白 */
  inset: 70px 55px 35px 55px;
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

/* ---------- 等阶名 + 突破按钮行（右侧顶部，flex 两侧布局） ---------- */
.level-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 6px;
  border-bottom: 1px solid rgba(140, 110, 60, 0.2);
}
.level-row .char-title {
  font-size: 13px;
  letter-spacing: 2px;
  color: #9fc880;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
}
.breakthrough-btn {
  flex: 0 0 auto;
  padding: 4px 16px;
  font-size: 12px;
  letter-spacing: 2px;
  color: #f0d896;
  background: linear-gradient(180deg, rgba(80, 60, 28, 0.85), rgba(48, 36, 16, 0.85));
  border: 1px solid rgba(200, 168, 96, 0.5);
  border-radius: 4px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
  transition: all 0.15s ease;
}
.breakthrough-btn:hover:not(:disabled) {
  border-color: rgba(240, 216, 150, 0.9);
  box-shadow: 0 0 8px rgba(240, 216, 150, 0.3);
  color: #fff0c8;
}
.breakthrough-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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

/* ---------- 功法项：图标 + 名称 + 等级 ---------- */
.technique-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.technique-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  background: linear-gradient(180deg, rgba(45, 34, 20, 0.8), rgba(28, 22, 14, 0.8));
  border: 1px solid rgba(160, 130, 70, 0.45);
  border-radius: 4px;
}
.technique-icon {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  pointer-events: none;
}
.technique-name {
  flex: 1;
  font-size: 12px;
  color: #ecd9a8;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}
.technique-level {
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
}

/* ---------- 斗技 tooltip 内容（浮层 Teleport 到 body，class 仍匹配） ---------- */
.skill-tip-name {
  font-size: 13px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  margin-bottom: 4px;
}
.skill-tip-rank {
  font-size: 10px;
  color: #c0a060;
  margin-left: 5px;
  font-weight: normal;
}
.skill-tip-meta {
  font-size: 10px;
  color: rgba(210, 180, 120, 0.8);
  margin-bottom: 3px;
}
.skill-tip-progress {
  font-size: 10px;
  color: rgba(200, 170, 110, 0.7);
  margin-bottom: 3px;
}
.skill-tip-desc {
  font-size: 10px;
  line-height: 1.5;
  color: rgba(190, 175, 145, 0.85);
  word-break: break-all;
}

/* ---------- 宝物 ---------- */
.treasure-item {
  position: relative;
}
.treasure-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
}
.treasure-unequip-btn {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  border: 1px solid rgba(150, 120, 70, 0.4);
  background: rgba(40, 30, 18, 0.7);
  color: rgba(220, 190, 120, 0.7);
  border-radius: 3px;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}
.treasure-unequip-btn:hover:not(:disabled) {
  background: rgba(150, 120, 70, 0.3);
  color: #e8d5a0;
}
.treasure-unequip-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
