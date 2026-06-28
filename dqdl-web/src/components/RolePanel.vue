<template>
  <div class="role-overlay" @click.self="emit('close')">
    <div class="role-panel">
      <div class="role-header">
        <span class="role-title">{{ player?.name }}</span>
        <span class="role-level">{{ levelName(player?.level || 1) }}</span>
        <button class="role-close" @click="emit('close')">&times;</button>
      </div>
      <div class="role-tabs">
        <div class="role-tab" :class="{ active: tab === 'attr' }" @click="tab = 'attr'">人物</div>
        <div class="role-tab" :class="{ active: tab === 'tech' }" @click="tab = 'tech'">功法</div>
      </div>

      <!-- 人物 Tab -->
      <div class="role-body char-body" v-if="tab === 'attr'">
        <div class="char-layout">
          <!-- 左：立绘 -->
          <div class="char-portrait">
            <img class="char-portrait-img" :src="portrait" :alt="player?.name" @error="onPortraitError" />
            <div class="char-portrait-mask"></div>
          </div>

          <!-- 右：属性 -->
          <div class="char-info">
            <!-- 固定：生命 / 斗气 -->
            <div class="attr-vital">
              <div class="vital-item is-hp">
                <span class="vital-label">生命</span>
                <span class="vital-val">{{ player?.hp ?? 0 }} / {{ player?.final_attrs?.max_hp ?? player?.max_hp ?? 100 }}</span>
              </div>
              <div class="vital-item is-energy">
                <span class="vital-label">斗气</span>
                <span class="vital-val">{{ player?.energy ?? 0 }} / {{ player?.final_attrs?.max_energy ?? player?.max_energy ?? 100 }}</span>
              </div>
            </div>

            <!-- 可滚动：基础属性 / 随机属性 -->
            <div class="char-scroll">
              <div class="char-section">
                <div class="char-section-title">基础属性</div>
                <div class="attr-row" v-for="key in baseAttrKeys" :key="key">
                  <span class="attr-label">{{ attrLabels[key] }}</span>
                  <span class="attr-base">{{ player?.[key] ?? 0 }}</span>
                  <span class="attr-bonus" v-if="(player?.final_attrs?.[key] ?? 0) - (player?.[key] ?? 0) > 0">
                    +{{ (player?.final_attrs?.[key] ?? 0) - (player?.[key] ?? 0) }}
                  </span>
                  <span class="attr-final">{{ player?.final_attrs?.[key] ?? player?.[key] ?? 0 }}</span>
                </div>
              </div>

              <div class="char-section">
                <div class="char-section-title">其他属性</div>
                <div class="char-extra-row" v-for="a in extraAttrs" :key="a.key">
                  <span class="char-extra-label">{{ a.label }}</span>
                  <span class="char-extra-val">{{ a.text }}</span>
                </div>
              </div>
            </div>

            <!-- 固定在右栏底部：修为 / 突破（不随滚动） -->
            <div class="attr-cult-row char-cult-fixed">
              <div class="cult-top">
                <span class="attr-label">修为</span>
                <button class="role-break-btn" :disabled="!canBreakthrough" @click="doBreakthrough">突破</button>
              </div>
              <div class="cult-bar" :class="{ 'is-full': canBreakthrough }">
                <div class="cult-bar-fill" :style="{ width: cultPct + '%' }"></div>
                <span class="cult-bar-text">{{ player?.cultivation ?? 0 }} / {{ player?.level_cultivation ?? 100 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 功法 Tab -->
      <div class="role-body" v-if="tab === 'tech'">
        <!-- 上：已装配功法 -->
        <div class="tech-equipped">
          <div class="tech-section-title">已装配</div>
          <div v-if="player?.technique" class="tech-card">
            <div class="tech-card-head">
              <div class="tech-card-info">
                <div class="tech-name">{{ player.technique.name }}</div>
                <div class="tech-meta">
                  <span class="tech-attr">属性: {{ player.technique.attribute }}</span>
                  <span class="tech-rank">{{ rankLabel(player.technique.rank) }}</span>
                  <span class="tech-lv">Lv.{{ player.technique.level }}</span>
                </div>
              </div>
              <button class="tech-unequip-btn" :disabled="techBusy" @click="unequip">卸下</button>
            </div>
            <div class="tech-desc" v-if="player.technique.description">{{ player.technique.description }}</div>
            <div class="tech-stats">
              <span>修为速度: {{ player.technique.growth }}</span>
              <span>最大等级: {{ player.technique.max_level }}</span>
            </div>
            <div class="tech-bonus" v-if="player.technique.base && Object.keys(player.technique.base).length">
              <span class="bonus-title">属性加成：</span>
              <span class="bonus-item" v-for="(val, k) in player.technique.base" :key="k">
                {{ attrLabels[k] || k }} +{{ val }}
              </span>
            </div>
          </div>
          <div v-else class="tech-empty">未装备功法</div>
        </div>

        <!-- 下：已习得功法（图标展示，同斗技；悬浮查看信息，点击装配） -->
        <div class="tech-inventory">
          <div class="tech-section-title">已习得功法</div>
          <div class="skill-inventory-grid">
            <div
              v-for="t in learnedTechniques"
              :key="t.id"
              class="skill-item tech-item"
              :class="{ 'is-equipped': t.equipped }"
              @click="onTechClick(t)"
              @mouseenter="showTechTip(t, $event)"
              @mouseleave="hideTechTip"
            >
              <div class="skill-icon">{{ t.name?.[0] || '功' }}</div>
              <div class="skill-name">{{ t.name }}</div>
              <div class="skill-lv">Lv.{{ t.level }}</div>
              <span v-if="t.equipped" class="tech-equipped-badge">已装</span>
              <button
                v-if="canBreakthroughTech(t)"
                class="tech-break-btn"
                @click.stop="openBreakthrough(t)"
              >突破</button>
            </div>
            <div v-if="learnedTechniques.length === 0" class="tech-empty">暂无已习得的功法</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 功法悬浮信息（脱离面板裁切） -->
    <Teleport to="body">
      <div v-if="techTip" ref="techTipEl" class="item-tip" :style="techTip.pos">
        <div class="tooltip-name">{{ techTip.t.name }}
          <span class="tt-rank">{{ rankLabel(techTip.t.rank) }}</span>
        </div>
        <div class="tooltip-desc">
          {{ techTip.t.attribute || '无' }}属性 · Lv.{{ techTip.t.level }}{{ techTip.t.max_level ? ' / ' + techTip.t.max_level : '' }}
        </div>
        <div class="tooltip-desc">修炼进度 {{ techTip.t.cultivation }} / {{ techTip.t.max_cultivation }}</div>
        <div v-if="techTip.t.description" class="tooltip-desc">{{ techTip.t.description }}</div>
        <div v-if="techTip.t.base && Object.keys(techTip.t.base).length" class="tooltip-desc tt-bonus">
          <span v-for="(val, k) in techTip.t.base" :key="k">{{ attrLabels[k] || k }} +{{ val }}&nbsp;</span>
        </div>
      </div>
    </Teleport>

    <!-- 装配确认弹框（替代浏览器原生 confirm） -->
    <div v-if="pendingTech" class="tech-confirm-overlay" @click.self="pendingTech = null">
      <div class="tech-confirm-box">
        <div class="tech-confirm-title">装配功法</div>
        <p class="tech-confirm-text">是否装配「{{ pendingTech.name }}」？<br>装配后将替换当前已装备的功法。</p>
        <div class="tech-confirm-actions">
          <button class="tech-cf-btn tech-cf-cancel" :disabled="techBusy" @click="pendingTech = null">取消</button>
          <button class="tech-cf-btn tech-cf-ok" :disabled="techBusy" @click="confirmEquip">装配</button>
        </div>
      </div>
    </div>

    <!-- 突破结果弹框：点击任意区域关闭 -->
    <div
      v-if="breakthroughResult"
      class="break-modal"
      :class="{ 'is-success': breakthroughResult.success, 'is-fail': !breakthroughResult.success }"
      @click="clearBreakthrough"
    >
      <div class="break-card">
        <div class="break-title">{{ breakthroughResult.success ? '突破成功' : '突破失败' }}</div>
        <p class="break-text">{{ breakthroughResult.text }}</p>
        <span class="break-hint">点击任意区域关闭</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { useGameStore } from '../stores/game'
import { equipTechnique, unequipTechnique } from '../api'
import { Message } from '../utils/message'
import { useTechniqueBreakthroughStore } from '../stores/techniqueBreakthrough'
import { attrLabels, baseAttrKeys, levelName } from '../game/constants'

const emit = defineEmits(['close'])

const playerStore = usePlayerStore()
const gameStore = useGameStore()
const { data: player } = storeToRefs(playerStore)
const { breakthroughResult } = storeToRefs(gameStore)

const tab = ref('attr')

function rankLabel(rank) {
  const t = ['天阶', '地阶', '玄阶', '黄阶'], g = ['上品', '中品', '下品']
  return (t[Math.floor(rank / 10)] || '') + (g[rank % 10] || '')
}
const canBreakthrough = computed(() => {
  const cur = player.value?.cultivation ?? 0
  const max = player.value?.level_cultivation ?? 100
  return cur >= max && max > 0
})
const cultPct = computed(() => {
  const cur = player.value?.cultivation ?? 0
  const max = player.value?.level_cultivation ?? 100
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (cur / max) * 100))
})

// 立绘：来自后端 player.portrait，缺失时回退默认
const DEFAULT_PORTRAIT = '/image/hero-char.webp'
const portrait = computed(() => player.value?.portrait || DEFAULT_PORTRAIT)
function onPortraitError(e) { if (e.target.src !== DEFAULT_PORTRAIT) e.target.src = DEFAULT_PORTRAIT }

// 其他属性（特殊/常驻加成）：修炼效率等。修炼效率基础 100%，宝物加成叠加其上
const extraAttrs = computed(() => {
  const ce = Number(player.value?.cultivation_efficiency) || 0
  return [
    { key: 'cultivation_efficiency', label: '修炼效率', text: (100 + ce) + '%' },
  ]
})

function doBreakthrough() { gameStore.doBreakthrough() }
function clearBreakthrough() { gameStore.clearBreakthrough() }

// ── 功法装配 ──
const techBusy = ref(false)
// 已习得功法全部展示（含已装配的，仅做标记），装配后不从列表移除
const learnedTechniques = computed(() => player.value?.techniques || [])
const pendingTech = ref(null)   // 待确认装配的功法
const techTip = ref(null)       // 悬浮信息 { t, pos }
const techTipEl = ref(null)     // 悬浮DOM（用于测量真实尺寸）

function onTechClick(t) {
  if (techBusy.value) return
  if (t.equipped) return        // 已装备，不重复操作
  pendingTech.value = t         // 打开自定义确认弹框
}

async function confirmEquip() {
  const t = pendingTech.value
  if (!t || techBusy.value) return
  techBusy.value = true
  try {
    const res = await equipTechnique(playerStore.playerId, t.id)
    playerStore.data = res.data
    Message.success('已装配：' + t.name)
    pendingTech.value = null
  } catch (e) {
    Message.error(e.response?.data?.message || '装配失败')
  } finally {
    techBusy.value = false
  }
}

async function unequip() {
  if (techBusy.value) return
  techBusy.value = true
  try {
    const res = await unequipTechnique(playerStore.playerId)
    playerStore.data = res.data
    Message.success('已卸下功法')
  } catch (e) {
    Message.error(e.response?.data?.message || '卸下失败')
  } finally {
    techBusy.value = false
  }
}

// 功法悬浮信息：仿 ElementUI/Popper 的 measure → flip → shift。
// 先隐藏渲染测出真实宽高，再决定放在格子下方还是上方，并把水平/垂直都夹紧到视口内。
function showTechTip(t, e) {
  const r = e.currentTarget.getBoundingClientRect()
  const M = 8
  // 第一步：先放到屏幕外隐藏渲染，下一帧测量
  techTip.value = { t, pos: { left: '-9999px', top: '-9999px', width: '240px', visibility: 'hidden' } }
  nextTick(() => {
    const el = techTipEl.value
    const w = el?.offsetWidth || 240
    const h = el?.offsetHeight || 120
    // shift（水平）：以格子中心对齐并夹紧
    let left = r.left + r.width / 2 - w / 2
    left = Math.max(M, Math.min(window.innerWidth - w - M, left))
    // flip（垂直）：优先下方；放不下翻到上方；都放不下则贴底
    let top = r.bottom + M
    if (top + h > window.innerHeight - M) {
      const above = r.top - M - h
      top = above >= M ? above : Math.max(M, window.innerHeight - h - M)
    }
    techTip.value = { t, pos: { left: left + 'px', top: top + 'px', width: w + 'px' } }
  })
}
function hideTechTip() { techTip.value = null }

// ── 功法突破（小游戏） ──
const tbStore = useTechniqueBreakthroughStore()
function canBreakthroughTech(t) {
  return (t.max_cultivation ?? 0) > 0 && (t.cultivation ?? 0) >= (t.max_cultivation ?? 0)
    && (!t.max_level || t.level < t.max_level)
}
function openBreakthrough(t) { tbStore.open(t) }
</script>

<style scoped>
/* 加大角色弹框（scoped 仅作用于本组件的 .role-panel，不影响其它面板） */
.role-panel { width: 760px; max-width: 96vw; }

/* 人物面板：左立绘 + 右属性（经典 RPG 布局，立绘:属性 ≈ 4:6） */
.char-layout {
  display: flex;
  gap: 16px;
  height: 500px;
}
.char-portrait {
  position: relative;
  flex: 4;
  min-width: 0;
  overflow: hidden;
  border-radius: var(--radius);
  border: 1px solid var(--border-strong);
  background: linear-gradient(180deg, #14141f, #0a0a12);
}
.char-portrait-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}
.char-portrait-mask {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(10, 10, 18, 0) 55%, rgba(10, 10, 18, 0.55) 100%);
}
.char-info {
  flex: 6;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.char-info .attr-vital {
  flex-shrink: 0;
  padding: 0 0 12px;
  margin-bottom: 0;
}
.char-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 4px 0;
}
.char-section { margin-bottom: 14px; }
.char-section-title {
  font-size: 0.8rem;
  color: #b0a878;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(201, 168, 106, 0.18);
}
.char-extra-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 0;
  border-bottom: 1px solid var(--border);
}
.char-extra-label { color: var(--text-muted); font-size: 0.88rem; }
.char-extra-val { color: var(--green); font-weight: bold; font-size: 0.92rem; }
/* 修为条固定在右栏底部，不随滚动 */
.char-cult-fixed { flex-shrink: 0; margin-top: 4px; }
.char-empty { color: #6a6a78; font-size: 0.82rem; font-style: italic; padding: 6px 0; }
/* 滚动条美化 */
.char-scroll::-webkit-scrollbar { width: 6px; }
.char-scroll::-webkit-scrollbar-thumb { background: rgba(201, 168, 106, 0.3); border-radius: 3px; }
.char-scroll::-webkit-scrollbar-track { background: transparent; }

.attr-cult-row {
  display: block;
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed rgba(201, 168, 106, 0.25);
}
.cult-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 7px;
}
/* 修为经验条 */
.cult-bar {
  position: relative;
  width: 100%;
  height: 16px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(111, 191, 168, 0.3);
  border-radius: 8px;
  overflow: hidden;
}
.cult-bar-fill {
  height: 100%;
  width: 0;
  background: linear-gradient(90deg, #3a8f78, #6fbfa8);
  transition: width 0.35s ease;
}
.cult-bar.is-full .cult-bar-fill {
  background: linear-gradient(90deg, #d4a84a, #f0d070);
  animation: cult-pulse 1.3s ease-in-out infinite;
}
.cult-bar-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 600;
  color: #eef0f6;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
}
@keyframes cult-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.25); }
}
.role-break-btn {
  margin-left: 8px;
  padding: 2px 12px;
  font-size: 0.76rem;
  letter-spacing: 1px;
  color: #d4af6a;
  background: rgba(60, 48, 20, 0.4);
  border: 1px solid #6a5020;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.role-break-btn:hover:not(:disabled) { background: rgba(80, 64, 28, 0.6); color: #f0d070; }
.role-break-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 功法装配 */
.tech-equipped { margin-bottom: 18px; }
.tech-section-title {
  font-size: 0.84rem;
  color: #b0a878;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(201, 168, 106, 0.2);
}
.tech-card-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.tech-card-info { flex: 1; min-width: 0; }
.tech-lv { color: #7fd09a; font-size: 0.8rem; }
.tech-unequip-btn {
  flex-shrink: 0;
  padding: 3px 12px;
  font-size: 0.76rem;
  color: #e08060;
  background: rgba(70, 40, 36, 0.4);
  border: 1px solid #5a2e28;
  border-radius: 4px;
  cursor: pointer;
  transition: filter var(--transition);
}
.tech-unequip-btn:not(:disabled):hover { filter: brightness(1.15); }
.tech-unequip-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tech-empty {
  color: #6a6a78;
  font-size: 0.86rem;
  font-style: italic;
  padding: 12px 0;
}
.tech-inventory .skill-item {
  cursor: pointer;
}
.tech-inventory .tech-item {
  position: relative;
}
.tech-inventory .tech-item:hover {
  filter: brightness(1.12);
}
.tech-inventory .tech-item.is-equipped {
  cursor: default;
  border-color: rgba(240, 192, 64, 0.5);
  background: rgba(80, 64, 28, 0.25);
}
.tech-equipped-badge {
  position: absolute;
  top: 3px;
  right: 3px;
  padding: 0 4px;
  font-size: 0.62rem;
  font-weight: 700;
  color: #2a2010;
  background: #f0c040;
  border-radius: var(--radius-pill);
  line-height: 14px;
}
.tech-break-btn {
  position: absolute;
  right: 3px;
  bottom: 3px;
  padding: 1px 7px;
  font-size: 0.66rem;
  font-weight: 700;
  color: #2a2010;
  background: #6fbfa8;
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  line-height: 15px;
}
.tech-break-btn:hover { filter: brightness(1.12); }
/* 悬浮信息里的额外样式 */
.tt-rank { font-size: 0.72rem; color: #c0a060; margin-left: 6px; font-weight: normal; }
.tt-bonus { color: #6fbfa8; }

/* 装配确认弹框 */
.tech-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 12, 0.6);
  backdrop-filter: blur(2px);
}
.tech-confirm-box {
  width: 340px;
  max-width: 90vw;
  padding: 22px 22px 16px;
  background: var(--bg-elev-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
  text-align: center;
}
.tech-confirm-title {
  font-size: 1.02rem;
  color: #e0d8c0;
  font-weight: 600;
  margin-bottom: 12px;
  letter-spacing: 0.05em;
}
.tech-confirm-text {
  font-size: 0.86rem;
  color: #b0b0c0;
  line-height: 1.7;
  margin: 0 0 18px;
}
.tech-confirm-actions { display: flex; gap: 12px; justify-content: center; }
.tech-cf-btn {
  padding: 6px 22px;
  font-size: 0.84rem;
  border-radius: var(--radius);
  cursor: pointer;
  transition: filter var(--transition);
}
.tech-cf-btn:not(:disabled):hover { filter: brightness(1.15); }
.tech-cf-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tech-cf-cancel { color: #b0b0c0; background: rgba(50, 50, 64, 0.5); border: 1px solid var(--border); }
.tech-cf-ok { color: #2a2010; background: #f0c040; border: 1px solid #d4a838; font-weight: 600; }

/* 突破结果弹框 */
.break-modal {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(5, 5, 12, 0.78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  cursor: pointer;
}
.break-card {
  width: 460px;
  max-width: 92vw;
  padding: 28px 28px 18px;
  text-align: center;
  background: var(--bg-elev-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
}
.is-success .break-card { border-color: #6fbfa8; box-shadow: 0 0 24px rgba(111, 191, 168, 0.35); }
.is-fail .break-card { border-color: #b06258; box-shadow: 0 0 24px rgba(176, 98, 88, 0.3); }
.break-title {
  font-size: 1.2rem;
  letter-spacing: 3px;
  margin-bottom: 14px;
}
.is-success .break-title { color: #6fbfa8; }
.is-fail .break-title { color: #d4926a; }
.break-text {
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1.7;
  margin: 0 0 18px;
}
.break-hint {
  display: block;
  font-size: 0.76rem;
  color: #8a8a9a;
  letter-spacing: 1px;
}
</style>
