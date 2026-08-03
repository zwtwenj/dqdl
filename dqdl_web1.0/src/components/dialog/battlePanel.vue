<script setup>
/**
 * 战斗界面：全局原子组件（App.vue 挂载，事件总线驱动显隐）。
 *
 * 触发：bus.on(BATTLE_OPEN, { mobId? }) → 打开战斗弹窗。
 *   - 带 mobId → 开新战斗（startBattle）
 *   - 不带（空）→ 还原当前进行中的战斗（getBattleState，从 battle_log 还原）
 *
 * 战斗 API（开战/行动/逃跑/还原）本组件自治，不依赖触发方。
 * 战斗结束后 emit BATTLE_RESULT（含 winner/over），触发方（如秘境）监听自判结算。
 *
 * 界面：左侧战斗舞台（立绘/HUD/斗技槽）+ 右侧战报，外层 Dlg。
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import Button from '@/components1/button.vue'
import ProgressBar from '@/components1/progressBar.vue'
import { bus, BusEvents } from '@/utils/eventBus'
import { startBattle, getBattleState, battleAction, fleeBattle } from '@/api'

/* ============ 战斗状态（自管） ============ */
const open = ref(false)
const snapshot = ref(null)
const busy = ref(false)

const player = computed(() => snapshot.value?.player || null)
const mob = computed(() => snapshot.value?.mob || null)
const over = computed(() => !!snapshot.value?.over)
const winner = computed(() => snapshot.value?.winner || null)
const skills = computed(() => snapshot.value?.skills || [])

/** BATTLE_OPEN：带 mobId 开新战斗；不带则还原当前战斗 */
async function handleOpen({ mobId } = {}) {
  open.value = true
  busy.value = true
  try {
    if (mobId) {
      snapshot.value = await startBattle(mobId)
    } else {
      snapshot.value = await getBattleState()
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '战斗开启失败' })
    open.value = false
  } finally {
    busy.value = false
  }
}

/** 玩家行动（普攻/斗技/逃跑） */
async function doAction(type, slot) {
  if (busy.value || over.value) return
  busy.value = true
  try {
    if (type === 'flee') {
      snapshot.value = await fleeBattle()
    } else {
      snapshot.value = await battleAction(type, slot)
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '行动失败' })
  } finally {
    busy.value = false
    // 战斗结束 → 广播结果（触发方监听自判结算）
    if (snapshot.value?.over) {
      bus.emit(BusEvents.BATTLE_RESULT, {
        winner: snapshot.value.winner,
        snapshot: snapshot.value,
      })
    }
  }
}

function close() {
  open.value = false
  snapshot.value = null
}

let offOpen = null
onMounted(() => {
  offOpen = bus.on(BusEvents.BATTLE_OPEN, handleOpen)
})
onUnmounted(() => {
  offOpen && offOpen()
})

const PLAYER_PORTRAIT = '/ui/boy.png'
const MOB_PORTRAIT_FALLBACK = '/icon/mob/WB-001.png'
function mobPortrait() {
  return MOB_PORTRAIT_FALLBACK
}
function onMobImgError(e) {
  if (e.target.src !== MOB_PORTRAIT_FALLBACK) e.target.src = MOB_PORTRAIT_FALLBACK
}

/* ============ HP/斗气百分比 ============ */
function pct(cur, max) {
  if (!max) return 0
  return Math.min(100, Math.max(0, (cur / max) * 100))
}

/* ============ 气血/斗气 tooltip（v-tooltip 文案） ============ */
const hpTip = computed(() => `当前气血：${player.value?.hp ?? 0} / ${player.value?.maxHp ?? 0}`)
const energyTip = computed(() => `当前斗气：${player.value?.energy ?? 0} / ${player.value?.maxEnergy ?? 0}`)
const mobHpTip = computed(() => `当前气血：${mob.value?.hp ?? 0} / ${mob.value?.maxHp ?? 0}`)

/* ============ 斗技槽位（5 槽，沿用老版本常驻设计） ============ */
const FALLBACK_SKILL_ICON = '/icon/cl/cl-100.png'
/** 斗技图标：dj- 前缀 → /icon/skill/{item_id}.png */
function skillIconUrl(s) {
  const id = s?.itemId
  if (id && id.startsWith('dj-')) return `/icon/skill/${id}.png`
  return FALLBACK_SKILL_ICON
}
function onSkillIconError(e) {
  if (e.target.src !== FALLBACK_SKILL_ICON) e.target.src = FALLBACK_SKILL_ICON
}
const ATTR_LABEL = { power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质' }

/** 把 skills 补齐到 5 槽，空槽位用 null 占位 */
const skillSlots = computed(() => {
  const filled = skills.value.map((s) => ({ ...s, filled: true }))
  while (filled.length < 5) filled.push({ filled: false })
  return filled.slice(0, 5)
})
function canUseSkill(s) {
  return player.value && player.value.energy >= (s.energyCost || 0)
}
function useSkill(slot) {
  if (over.value || busy.value) return
  doAction('skill', slot)
}

/* ============ 斗技 tooltip（v-tooltip，与背包/人物面板一致） ============ */
function skillTip(s) {
  if (!s?.filled) return ''
  const lines = [`<span style="font-size:14px;font-weight:bold;color:#f0c040;">${s.name || '未知斗技'}</span>`]
  if (s.attr) lines.push(`<span style="color:#c8a0ff;">${ATTR_LABEL[s.attr] || s.attr}属性 · 耗气 ${s.energyCost ?? 0}</span>`)
  return lines.join('<br/>')
}

/* ============ 操作按钮 ============ */
function onAttack() {
  doAction('normal')
}
function onFlee() {
  doAction('flee')
}

/* ============ 受击动画（前后端无 hurt 状态，用 hp 变化检测触发） ============ */
const playerHurt = ref(false)
const mobHurt = ref(false)
const playerHp = computed(() => player.value?.hp ?? 0)
const mobHp = computed(() => mob.value?.hp ?? 0)
let playerHpPrev = 0
let mobHpPrev = 0
watch(playerHp, (v) => {
  if (v < playerHpPrev) {
    playerHurt.value = true
    setTimeout(() => (playerHurt.value = false), 420)
  }
  playerHpPrev = v
})
watch(mobHp, (v) => {
  if (v < mobHpPrev) {
    mobHurt.value = true
    setTimeout(() => (mobHurt.value = false), 420)
  }
  mobHpPrev = v
})

/* ============ 战报滚动（自动滚底） ============ */
const logBox = ref(null)
const logEntries = computed(() => snapshot.value?.log || [])
watch(
  () => logEntries.value.length,
  async () => {
    await nextTick()
    const el = logBox.value
    if (el) el.scrollTop = el.scrollHeight
  },
)
/** 战报关键词高亮 */
function logClass(line) {
  if (!line) return ''
  if (line.includes('⚡') || line.includes('暴击')) return 'crit'
  if (line.includes('🎉') || line.includes('击败')) return 'kill'
  if (line.includes('👻') || line.includes('闪避')) return 'dodge'
  if (line.includes('🛡')) return 'shield'
  if (line.includes('🩸') || line.includes('🔥') || line.includes('💢')) return 'dot'
  if (line.includes('🏃')) return 'flee'
  return ''
}

/* ============ buff 悬浮 tooltip（Teleport 到 body，脱离 overflow:hidden） ============ */
const buffTooltip = ref(null)
function showBuffTip(b, e) {
  const r = e.currentTarget.getBoundingClientRect()
  buffTooltip.value = {
    b,
    pos: { left: r.left + r.width / 2 + 'px', top: r.bottom + 6 + 'px' },
  }
}
function hideBuffTip() {
  buffTooltip.value = null
}

/* ============ 结果展示 ============ */
const resultText = computed(() => {
  if (!over.value) return ''
  if (winner.value === 'player') return '胜 利'
  if (winner.value === 'mob') return '挑 战 失 败'
  return '已逃离'
})
const resultClass = computed(() => {
  if (winner.value === 'player') return 'is-win'
  if (winner.value === 'mob') return 'is-lose'
  return 'is-flee'
})
</script>

<template>
  <Dlg
    v-if="open"
    title="战斗"
    :contentStyleProp="{ width: '1152px' }"
    @close="close"
  >
    <div class="battle-body">
        <!-- ========== 上：战斗舞台（玩家 vs 怪物） ========== -->
        <div class="battle-stage">
          <div class="battle-field">
            <!-- 左：玩家立绘 + 下方信息 -->
            <div class="fighter-col">
              <div
                class="fighter fighter--player"
                :class="{ hurt: playerHurt }"
              >
                <img
                  class="fighter-bg"
                  :src="PLAYER_PORTRAIT"
                  alt="角色"
                  @error="onMobImgError"
                >
                <div class="fighter-shade" />
                <div class="fighter-hud">
                  <div
                    v-if="player?.buffs?.length"
                    class="buff-row"
                  >
                    <span
                      v-for="(b, i) in player.buffs"
                      :key="'pb'+i"
                      class="buff"
                      @mouseenter="showBuffTip(b, $event)"
                      @mouseleave="hideBuffTip"
                    >{{ b.icon }}<em v-if="b.stacks > 1">×{{ b.stacks }}</em></span>
                  </div>
                </div>
              </div>
              <!-- 玩家信息：名称·境界 / 气血 / 斗气（ProgressBar 组件） -->
              <div class="fighter-info">
                <div class="fi-name">{{ player?.name || '勇者' }} · {{ player?.level_name || ('Lv.' + (player?.level ?? 1)) }}</div>
                <div class="fi-row">
                  <div class="fi-label">气血：</div>
                  <ProgressBar type="hp" :pct="pct(player?.hp ?? 0, player?.maxHp ?? 0)" :tip="hpTip" />
                </div>
                <div class="fi-row">
                  <div class="fi-label">斗气：</div>
                  <ProgressBar type="energy" :pct="pct(player?.energy ?? 0, player?.maxEnergy ?? 0)" :tip="energyTip" />
                </div>
              </div>
            </div>

            <!-- 中：战报 -->
            <div class="log-col">
              <div class="log-header">
                战报
              </div>
              <div
                ref="logBox"
                class="log-box"
              >
                <div
                  v-for="(line, i) in logEntries"
                  :key="i"
                  class="log-line"
                  :class="logClass(line)"
                >
                  {{ line }}
                </div>
                <div
                  v-if="!logEntries.length"
                  class="log-empty"
                >
                  战斗即将开始...
                </div>
              </div>
            </div>

            <!-- 右：怪物立绘 + 下方信息 -->
            <div class="fighter-col">
              <div
                class="fighter fighter--mob"
                :class="{ hurt: mobHurt }"
              >
                <img
                  class="fighter-bg"
                  :src="mobPortrait()"
                  alt="怪物"
                  @error="onMobImgError"
                >
                <div class="fighter-shade" />
                <div class="fighter-hud">
                  <div
                    v-if="mob?.buffs?.length"
                    class="buff-row"
                  >
                    <span
                      v-for="(b, i) in mob.buffs"
                      :key="'mb'+i"
                      class="buff"
                      @mouseenter="showBuffTip(b, $event)"
                      @mouseleave="hideBuffTip"
                    >{{ b.icon }}<em v-if="b.stacks > 1">×{{ b.stacks }}</em></span>
                  </div>
                </div>
              </div>
              <!-- 怪物信息：名称·阶 / 气血（ProgressBar 组件） -->
              <div class="fighter-info">
                <div class="fi-name">{{ mob?.name || '???' }} · {{ mob?.rankLabel || '一阶' }}</div>
                <div class="fi-row">
                  <div class="fi-label">气血：</div>
                  <ProgressBar type="hp" :pct="pct(mob?.hp ?? 0, mob?.maxHp ?? 0)" :tip="mobHpTip" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ========== 下：操作区（攻击 | 斗技 | 逃跑） ========== -->
        <div class="battle-actions">
            <!-- 攻击 -->
            <Button class="act-btn" @click="onAttack">攻击</Button>

            <!-- 5 个斗技格子（背包同款样式，hover 显示 tooltip） -->
            <div class="skill-slot-list">
              <div
                v-for="(sk, idx) in skillSlots"
                :key="idx"
                class="skill-slot-cell"
                :class="{
                  'has-item': sk.filled,
                  disabled: over || busy || (sk.filled && !canUseSkill(sk)),
                }"
                v-tooltip="skillTip(sk)"
                @click="sk.filled && useSkill(idx)"
              >
                <template v-if="sk.filled">
                  <img
                    class="skill-slot-icon"
                    :src="skillIconUrl(sk)"
                    :alt="sk.name"
                    @error="onSkillIconError"
                  >
                  <span class="skill-slot-cost">{{ sk.energyCost }}</span>
                </template>
                <span v-else class="skill-slot-empty">·</span>
              </div>
            </div>

            <!-- 逃跑 -->
            <Button class="act-btn" @click="onFlee">逃跑</Button>
          </div>
      </div>

    <!-- 战斗结果横幅：全屏遮罩，点击任意位置关闭 -->
    <div
      v-if="over"
      class="battle-result"
      :class="resultClass"
      @click="close"
    >
      <div class="battle-result-text">
        {{ resultText }}
      </div>
    </div>

    <!-- buff 悬浮 tooltip（Teleport 到 body，脱离战斗框 overflow:hidden） -->
    <Teleport to="body">
      <div
        v-if="buffTooltip"
        class="buff-tooltip"
        :style="buffTooltip.pos"
      >
        <span class="bt-name">{{ buffTooltip.b.name }}</span><span
          v-if="buffTooltip.b.stacks > 1"
          class="bt-stack"
        > ×{{ buffTooltip.b.stacks }}</span><span class="bt-sep">：</span>{{ buffTooltip.b.desc }}<span class="bt-dur">（{{ buffTooltip.b.remaining === '∞' ? '永久' : buffTooltip.b.remaining + '回合' }}）</span>
      </div>
    </Teleport>
  </Dlg>
</template>

<style scoped>
/* ========== 主体布局（一列：上舞台 / 中战报 / 下操作） ========== */
.battle-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

/* ===== 战斗舞台（左玩家 / 中战报 / 右怪物） ===== */
.battle-stage {
  flex: 0 0 auto;
}
.battle-field {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 16px;
}

/* 立绘列：立绘 + 下方信息 */
.fighter-col {
  flex: 1;
  max-width: 216px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fighter {
  position: relative;
  width: 100%;
  height: 380px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(180, 150, 90, 0.45);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  background: #0c0c16;
}

/* 玩家/怪物信息（player-hp 风格：名称 + 气血/斗气进度条） */
.fighter-info {
  height: 98px;
  padding: 8px 10px;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.9), rgba(14, 11, 8, 0.92));
  border: 1px solid rgba(180, 150, 90, 0.3);
  text-align: left;
  border-radius: 8px;
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  .fi-name {
    font-size: 14px;
    font-weight: bold;
    color: #f0d890;
    letter-spacing: 1px;
    margin-bottom: 8px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .fi-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    .fi-label {
      width: 42px;
      font-size: 12px;
      color: #d4b070;
      flex-shrink: 0;
    }
    /* ProgressBar 组件在 flex 中撑满 */
    :deep(.progress-point-bg) {
      flex: 1;
    }
  }
}

/* 立绘作背景全屏铺满 */
.fighter-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}
.fighter--mob .fighter-bg {
  object-fit: contain;
  background: radial-gradient(circle at 50% 42%, #2a1424 0%, #120c18 70%, #0a0a12 100%);
}

/* 遮罩：压暗顶部（状态可读）与底部（名牌可读） */
.fighter-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.12) 28%, rgba(0, 0, 0, 0) 48%, rgba(0, 0, 0, 0.1) 62%, rgba(0, 0, 0, 0.8) 100%);
}

/* 悬浮状态层 */
.fighter-hud {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.stat-line {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  max-width: 252px;
}
.stat-line--ghost {
  opacity: 0;
  pointer-events: none;
}
.bar-cap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
}
.stat-ico {
  font-size: 0.85rem;
  width: 13px;
  text-align: center;
  flex-shrink: 0;
}
.ico-hp {
  color: #ff6b6b;
}
.ico-energy {
  color: #7aa0e8;
}
.bar {
  position: relative;
  width: 100%;
  height: 12px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: 6px;
  transition: width 0.4s ease;
}
.fill-hp {
  background: linear-gradient(90deg, #c0392b, #ff6b6b);
  box-shadow: 0 0 8px rgba(255, 107, 107, 0.5);
}
.fill-energy {
  background: linear-gradient(90deg, #2a4a8a, #6ea0e8);
  box-shadow: 0 0 8px rgba(110, 160, 232, 0.45);
}
.bar-num {
  font-size: 0.72rem;
  font-weight: 700;
  color: #f0f0f5;
  text-shadow: 0 1px 2px #000;
}

/* buff 行 */
.buff-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
.buff {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 1.02rem;
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.18);
  line-height: 1;
  cursor: help;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.buff:hover {
  background: rgba(0, 0, 0, 0.75);
  border-color: rgba(255, 210, 74, 0.6);
}
.buff em {
  font-style: normal;
  font-size: 0.62rem;
  color: #ffd24a;
}

/* 名牌 */
.fighter-name {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  z-index: 2;
  color: #f0f0f5;
  font-weight: 700;
  font-size: 1.02rem;
  text-shadow: 0 1px 4px #000, 0 0 6px rgba(0, 0, 0, 0.8);
}

/* VS */
.battle-vs {
  align-self: center;
  flex-shrink: 0;
  color: #d4af6a;
  font-size: 1.8rem;
  filter: drop-shadow(0 0 10px rgba(240, 192, 64, 0.55));
}

/* 受击抖动 + 红闪 */
.fighter.hurt {
  animation: hurtShake 0.42s ease;
}
.fighter.hurt .fighter-bg {
  filter: brightness(1.5) sepia(0.6) hue-rotate(-25deg) saturate(2.2);
}
@keyframes hurtShake {
  0%   { transform: translate(0, 0) rotate(0) scale(1); }
  15%  { transform: translate(-10px, 3px) rotate(-4deg) scale(1.02); }
  30%  { transform: translate(9px, -3px) rotate(4deg) scale(1.02); }
  45%  { transform: translate(-7px, 2px) rotate(-3deg); }
  60%  { transform: translate(5px, -2px) rotate(2deg); }
  75%  { transform: translate(-3px, 1px) rotate(-1deg); }
  100% { transform: translate(0, 0) rotate(0) scale(1); }
}

/* ===== 操作区：攻击(Button) + 斗技格子 + 逃跑(Button) ===== */
.battle-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

/* 攻击/逃跑用 Button 组件，稍微放大 */
.battle-actions :deep(.dqdl-button) {
  width: 110px;
  font-size: 14px;
  letter-spacing: 3px;
}

/* 斗技格子（背包同款样式） */
.skill-slot-list {
  display: flex;
  gap: 6px;
}
.skill-slot-cell {
  width: 56px;
  height: 56px;
  background: url('/static/item-cell-bg.gif');
  background-size: 100% 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s ease;
  &.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .skill-slot-icon {
    width: 90%;
    height: 90%;
    object-fit: contain;
    pointer-events: none;
  }
  .skill-slot-cost {
    position: absolute;
    bottom: 1px;
    right: 2px;
    font-size: 11px;
    color: #80c8ff;
    text-shadow: 1px 1px 2px #000;
    pointer-events: none;
  }
  .skill-slot-empty {
    color: rgba(160, 140, 100, 0.4);
    font-size: 20px;
  }
}

/* 斗技 tooltip 内容样式（FloatingTooltip Teleport 到 body） */
.skill-tip-name {
  font-size: 13px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  margin-bottom: 3px;
}
.skill-tip-meta {
  font-size: 10px;
  color: rgba(200, 170, 110, 0.8);
}

/* ===== 战斗结果横幅：全屏遮罩，点击任意位置关闭 ===== */
.battle-result {
  position: fixed;
  inset: 0;
  z-index: 310;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  cursor: pointer;
  animation: br-in 0.3s ease;
}
@keyframes br-in {
  from { opacity: 0; transform: scale(1.1); }
  to { opacity: 1; transform: scale(1); }
}
.battle-result-text {
  font-size: 3.2rem;
  letter-spacing: 14px;
  font-family: "Noto Serif SC", "Songti SC", 'STKaiti', serif;
  text-shadow: 0 0 24px currentColor;
}
.battle-result.is-win .battle-result-text {
  color: #f0c040;
}
.battle-result.is-lose .battle-result-text {
  color: #c05060;
}
.battle-result.is-flee .battle-result-text {
  color: rgba(200, 180, 150, 0.8);
}

/* ---------- 右列：战报 ---------- */
.log-col {
  flex: 1;           /* 中间列：战报撑满 */
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(20, 16, 10, 0.6), rgba(10, 8, 5, 0.6));
  border: 1px solid rgba(140, 110, 60, 0.2);
  border-radius: 6px;
  min-width: 0;
}
.log-header {
  flex: 0 0 auto;
  padding: 8px 12px;
  font-size: 13px;
  letter-spacing: 4px;
  color: #d4b070;
  border-bottom: 1px solid rgba(140, 110, 60, 0.2);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.8);
}
.log-box {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  text-align: left;
}
.log-box::-webkit-scrollbar {
  width: 4px;
}
.log-box::-webkit-scrollbar-thumb {
  background: rgba(180, 150, 90, 0.3);
  border-radius: 2px;
}
.log-line {
  font-size: 12px;
  line-height: 1.7;
  color: rgba(210, 195, 165, 0.85);
  margin-bottom: 2px;
  word-break: break-all;
}
.log-line.crit {
  color: #ffc060;
  font-weight: bold;
}
.log-line.kill {
  color: #f0d896;
  font-weight: bold;
}
.log-line.dodge {
  color: #80e0a0;
}
.log-line.shield {
  color: #80c8ff;
}
.log-line.dot {
  color: #e08060;
}
.log-line.flee {
  color: rgba(200, 180, 150, 0.7);
}
.log-empty {
  font-size: 12px;
  color: rgba(200, 170, 110, 0.4);
  text-align: center;
  padding: 20px;
}

/* buff 悬浮 tooltip（Teleport 到 body） */
.buff-tooltip {
  position: fixed;
  z-index: 9999;
  transform: translateX(-50%);
  padding: 7px 10px;
  background: rgba(15, 15, 22, 0.97);
  border: 1px solid rgba(255, 210, 74, 0.5);
  border-radius: 7px;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #e8e2d0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.65);
  pointer-events: none;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.buff-tooltip .bt-name {
  color: #ffd24a;
  font-weight: 700;
}
.buff-tooltip .bt-stack {
  color: #ffd24a;
}
.buff-tooltip .bt-dur {
  color: #9fb4e0;
}
</style>
