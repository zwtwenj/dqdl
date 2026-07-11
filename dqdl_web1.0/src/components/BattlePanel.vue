<script setup>
/**
 * 战斗界面：全屏覆盖层。
 *
 * 左侧（战斗舞台 + 操作）沿用老版本 dqdl-web 的设计：
 *   - 立绘作背景全屏铺满整个舞台（fighter），HUD（气血/斗气条 + buff）悬浮其上
 *   - 受击抖动动画 + 浮动伤害数字
 *   - 底部 5 个斗技槽位常驻（filled/空槽），点斗技槽直接施放
 *
 * 右侧战报滚动框（叙事日志，自动滚底，关键词高亮）保持不变。
 *
 * Props:
 *   snapshot (object|null) - 后端 BattleSnapshot
 *   busy    (boolean)     - 是否正在请求中（禁用按钮防连点）
 * Emits:
 *   action ({type, slot}) - 玩家行动
 *   close                 - 关闭（战斗结束后）
 */
import { ref, computed, watch, nextTick } from 'vue'
import FloatingTooltip from './FloatingTooltip.vue'

const props = defineProps({
  snapshot: { type: Object, default: null },
  busy: { type: Boolean, default: false },
})
const emit = defineEmits(['action', 'close'])

/* ============ 玩家/怪物数据 ============ */
const player = computed(() => props.snapshot?.player || null)
const mob = computed(() => props.snapshot?.mob || null)
const over = computed(() => !!props.snapshot?.over)
const winner = computed(() => props.snapshot?.winner || null)
const skills = computed(() => props.snapshot?.skills || [])

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
  if (over.value || props.busy) return
  emit('action', { type: 'skill', slot })
}

/* ============ 斗技 tooltip（hover 槽位时显示名称/耗气/属性） ============ */
const skillTipEl = ref(null)
const skillTipData = ref(null)
const skillTipOpen = ref(false)
function onSkillEnter(e, s) {
  if (!s?.filled) return
  skillTipEl.value = e.currentTarget
  skillTipData.value = s
  skillTipOpen.value = true
}
function onSkillLeave() {
  skillTipOpen.value = false
}

/* ============ 操作按钮 ============ */
function onAttack() {
  emit('action', { type: 'normal' })
}
function onFlee() {
  emit('action', { type: 'flee' })
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
const logEntries = computed(() => props.snapshot?.log || [])
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

function close() {
  emit('close')
}
</script>

<template>
  <div class="battle-overlay">
    <div class="battle-box">
      <div class="battle-body">
        <!-- ========== 左侧：战斗舞台 + 操作 ========== -->
        <div class="left-col">
          <!-- 战斗舞台：玩家 vs 怪物（沿用老版本 fighter 设计） -->
          <div class="battle-field">
            <!-- 玩家舞台：立绘作背景全屏铺满，HUD 悬浮其上 -->
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
                <div class="stat-line">
                  <div class="bar-cap">
                    <span class="stat-ico ico-hp">❤</span>
                    <span class="bar-num">{{ player?.hp ?? 0 }}/{{ player?.maxHp ?? 0 }}</span>
                  </div>
                  <div class="bar">
                    <i
                      class="fill-hp"
                      :style="{ width: pct(player?.hp ?? 0, player?.maxHp ?? 0) + '%' }"
                    />
                  </div>
                </div>
                <div class="stat-line">
                  <div class="bar-cap">
                    <span class="stat-ico ico-energy">✦</span>
                    <span class="bar-num">{{ player?.energy ?? 0 }}/{{ player?.maxEnergy ?? 0 }}</span>
                  </div>
                  <div class="bar">
                    <i
                      class="fill-energy"
                      :style="{ width: pct(player?.energy ?? 0, player?.maxEnergy ?? 0) + '%' }"
                    />
                  </div>
                </div>
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
              <div class="fighter-name">
                {{ player?.name || '勇者' }} · Lv.{{ player?.level ?? 1 }}
              </div>
            </div>

            <div class="battle-vs">
              ⚔
            </div>

            <!-- 怪物舞台 -->
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
                <div class="stat-line">
                  <div class="bar-cap">
                    <span class="stat-ico ico-hp">❤</span>
                    <span class="bar-num">{{ mob?.hp ?? 0 }}/{{ mob?.maxHp ?? 0 }}</span>
                  </div>
                  <div class="bar">
                    <i
                      class="fill-hp"
                      :style="{ width: pct(mob?.hp ?? 0, mob?.maxHp ?? 0) + '%' }"
                    />
                  </div>
                </div>
                <!-- 怪物无斗气槽：等高占位，使双方 buff 栏垂直对齐 -->
                <div
                  class="stat-line stat-line--ghost"
                  aria-hidden="true"
                >
                  <div class="bar-cap">
                    <span class="stat-ico">✦</span>
                  </div>
                  <div class="bar" />
                </div>
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
              <div class="fighter-name">
                {{ mob?.name || '???' }} · Lv.{{ mob?.level ?? 1 }}
              </div>
            </div>
          </div>

          <!-- 操作区：攻击 | 5 斗技图标槽 | 逃跑（7 个等宽按键） -->
          <div class="battle-actions">
            <!-- 攻击 -->
            <button
              class="act-btn"
              type="button"
              :disabled="over || busy"
              @click="onAttack"
            >
              <span class="act-text">攻击</span>
            </button>

            <!-- 5 个斗技图标槽（hover 显示 tooltip） -->
            <div
              v-for="(sk, idx) in skillSlots"
              :key="idx"
              class="act-btn skill-slot"
              :class="{
                filled: sk.filled,
                disabled: over || busy || (sk.filled && !canUseSkill(sk)),
              }"
              @click="sk.filled && useSkill(idx)"
              @pointerenter="onSkillEnter($event, sk)"
              @pointerleave="onSkillLeave"
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
              <span
                v-else
                class="skill-slot-empty"
              >·</span>
            </div>

            <!-- 逃跑 -->
            <button
              class="act-btn"
              type="button"
              :disabled="busy"
              @click="onFlee"
            >
              <span class="act-text">逃跑</span>
            </button>
          </div>

          <!-- 战斗结束：全屏遮罩（点击任意位置关闭），沿用老版本设计 -->
        </div>

        <!-- ========== 右侧：战报 ========== -->
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

    <!-- 斗技悬浮 tooltip（FloatingTooltip，hover 斗技槽时显示） -->
    <FloatingTooltip
      v-model:open="skillTipOpen"
      :reference="skillTipEl"
      placement="top"
    >
      <div class="skill-tip-name">
        {{ skillTipData?.name || '未知斗技' }}
      </div>
      <div
        v-if="skillTipData?.attr"
        class="skill-tip-meta"
      >
        {{ ATTR_LABEL[skillTipData.attr] || skillTipData.attr }}属性 · 耗气 {{ skillTipData?.energyCost ?? 0 }}
      </div>
    </FloatingTooltip>
  </div>
</template>

<style scoped>
/* ========== 全屏覆盖层（与游戏背景同宽，左对齐到 1200px 设计区，参考 CharacterSelectDialog） ========== */
.battle-overlay {
  position: fixed;
  width: 1200px;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 12, 0.8);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.battle-box {
  width: 100%;
  max-width: 1152px;
  max-height: 92vh;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.95), rgba(14, 11, 8, 0.97));
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 12px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  overflow: hidden;
  position: relative;
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* ========== 主体布局 ========== */
.battle-body {
  display: flex;
  gap: 12px;
  padding: 12px;
}

/* ---------- 左列 ---------- */
.left-col {
  flex: 0 0 64%;
  display: flex;
  flex-direction: column;
}

/* ===== 战斗舞台（沿用老版本 fighter 设计） ===== */
.battle-field {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 16px 16px 12px;
  gap: 16px;
}

.fighter {
  position: relative;
  flex: 1;
  max-width: 320px;
  height: 380px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(180, 150, 90, 0.45);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  background: #0c0c16;
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

/* ===== 操作区：7 个等宽按键（攻击 + 5 斗技 + 逃跑） ===== */
.battle-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: stretch;
  padding: 16px 20px 20px;
}

/* 统一按键：等宽正方形块，攻击/斗技/逃跑大小一致 */
.act-btn {
  flex: 1 1 0;
  min-width: 0;
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 4px;
  font-size: 15px;
  letter-spacing: 3px;
  color: #e8d5a0;
  background: linear-gradient(180deg, rgba(45, 34, 20, 0.85), rgba(28, 22, 14, 0.85));
  border: 1px solid rgba(160, 130, 70, 0.45);
  border-radius: 6px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  transition: all 0.15s ease;
}
.act-btn:hover:not(:disabled):not(.disabled) {
  border-color: rgba(220, 190, 120, 0.8);
  background: linear-gradient(180deg, rgba(60, 45, 26, 0.9), rgba(40, 30, 20, 0.9));
  transform: translateY(-1px);
}
.act-btn:disabled,
.act-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.act-text {
  font-size: 15px;
  letter-spacing: 4px;
}

/* 斗技槽（filled 时显示图标 + 耗气角标） */
.skill-slot.filled {
  border-color: rgba(192, 160, 240, 0.5);
  background: rgba(192, 160, 240, 0.08);
}
.skill-slot.filled:hover:not(.disabled) {
  border-color: rgba(192, 160, 240, 0.9);
  background: rgba(192, 160, 240, 0.16);
}
.skill-slot-icon {
  width: 32px;
  height: 32px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  pointer-events: none;
}
.skill-slot-cost {
  font-size: 10px;
  color: #80c8ff;
  font-family: 'Georgia', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
}
.skill-slot-empty {
  font-size: 20px;
  color: rgba(160, 140, 100, 0.3);
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
  flex: 1;
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
