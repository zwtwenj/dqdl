<template>
  <div class="role-overlay" v-if="store.showPanel" :style="{ zIndex: store.overlayZ }" @click.self="store.close">
    <div class="role-panel cultivation-room-panel">
      <div class="role-header">
        <span class="role-title">修炼室</span>
        <button class="role-close" @click="store.close">&times;</button>
      </div>

      <div class="cr-content">
        <!-- 进行中：实时修炼视图 -->
        <template v-if="store.isActive">
          <div class="cr-live-head">
            <span class="cr-live-tier">{{ store.progress?.name || '修炼中' }} · {{ tierName(store.session.tier) }}</span>
            <span class="cr-live-money">💰 {{ player?.money ?? 0 }} 金币</span>
          </div>
          <div class="cr-cult">
            <div class="cr-cult-top">
              <span class="cr-cult-label">{{ progressLabel }}</span>
              <span class="cr-cult-val">Lv.{{ store.progress?.level ?? 1 }} · {{ store.progress?.current ?? 0 }} / {{ store.progress?.max ?? 0 }}</span>
            </div>
            <div class="cr-cult-bar" :class="{ 'is-full': cultFull }">
              <div class="cr-cult-fill" :style="{ width: cultPct + '%' }"></div>
            </div>
          </div>
          <div class="cr-stats">
            <div class="cr-stat"><em>{{ store.session.rounds }}</em><span>修炼轮次</span></div>
            <div class="cr-stat"><em class="is-gain">+{{ store.session.total_gained }}</em><span>累计修为</span></div>
            <div class="cr-stat"><em class="is-cost">{{ store.session.total_cost }}</em><span>消耗金币</span></div>
          </div>
          <div class="cr-spin"><div class="spinner-sm"></div><span>修炼中…</span></div>
          <button class="cr-stop-btn" @click="store.stop">停止修炼</button>
        </template>

        <!-- 选择向导 -->
        <template v-else>
          <div v-if="store.stopReason" class="cr-reason">{{ reasonText }}</div>

          <!-- 第一步：选择修炼室档位 -->
          <div v-if="store.step === 'tier'" class="cr-kind">
            <div class="cr-kind-title">选择修炼室</div>
            <div class="cr-tier-list">
              <div v-for="t in store.tiers" :key="t.tier" class="cr-tier-card" @click="store.pickTier(t.tier)">
                <div class="cr-tier-name">{{ t.name }}</div>
                <div class="cr-tier-meta">斗气浓郁度 {{ t.qi }}</div>
                <div class="cr-tier-cost">{{ t.cost }} 金币 / 次</div>
              </div>
            </div>
          </div>

          <!-- 第二步：选择修炼内容 -->
          <div v-else-if="store.step === 'type'" class="cr-kind">
            <div class="cr-kind-title">{{ tierName(store.selectedTier) }} · 选择修炼内容</div>
            <div class="cr-type-list">
              <button class="cr-type-btn" :disabled="store.loading" @click="store.enter(store.selectedTier, 'qi')">
                <span class="cr-type-name">修炼斗气</span>
                <span class="cr-type-desc">提升突破修为</span>
              </button>
              <button class="cr-type-btn" :disabled="store.loading" @click="store.goTechniquePicker()">
                <span class="cr-type-name">修炼功法</span>
                <span class="cr-type-desc">提升功法修为</span>
              </button>
              <button class="cr-type-btn" :disabled="store.loading" @click="store.goSkillPicker()">
                <span class="cr-type-name">修炼斗技</span>
                <span class="cr-type-desc">提升斗技修为（满即自动突破）</span>
              </button>
            </div>
            <button class="cr-back" @click="store.goTier()">‹ 返回</button>
          </div>

          <!-- 第三步（功法）：选择修炼哪一项功法 -->
          <div v-else-if="store.step === 'technique'" class="cr-kind">
            <div class="cr-kind-title">选择修炼功法</div>
            <div class="skill-inventory-grid cr-tech-grid">
              <div
                v-for="t in techniques"
                :key="t.id"
                class="skill-item tech-item"
                :class="{ 'is-full': techIsFull(t) }"
                @click="onPickTechnique(t)"
              >
                <div class="skill-icon">{{ t.name?.[0] || '功' }}</div>
                <div class="skill-name">{{ t.name }}</div>
                <div class="skill-lv">Lv.{{ t.level }}</div>
                <span v-if="techIsFull(t) && !canBreakthroughTech(t)" class="cr-full-badge">已满</span>
                <button v-if="canBreakthroughTech(t)" class="cr-break-btn" @click.stop="openBreakthrough(t)">突破</button>
              </div>
              <div v-if="techniques.length === 0" class="cr-empty-inline">暂无已习得功法</div>
            </div>
            <button class="cr-back" @click="store.goType()">‹ 返回</button>
          </div>

          <!-- 第三步（斗技）：选择修炼哪一项斗技（修为满自动突破，可连续修炼至满级） -->
          <div v-else-if="store.step === 'skill'" class="cr-kind">
            <div class="cr-kind-title">选择修炼斗技</div>
            <div class="skill-inventory-grid cr-tech-grid">
              <div
                v-for="s in skills"
                :key="s.id"
                class="skill-item tech-item"
                :class="{ 'is-full': skillIsMaxed(s) }"
                @click="onPickSkill(s)"
              >
                <div class="skill-icon">{{ s.name?.[0] || '技' }}</div>
                <div class="skill-name">{{ s.name }}</div>
                <div class="skill-lv">Lv.{{ s.level }}{{ s.max_level ? '/' + s.max_level : '' }}</div>
                <span v-if="skillIsMaxed(s)" class="cr-full-badge">已满</span>
              </div>
              <div v-if="skills.length === 0" class="cr-empty-inline">暂无已习得斗技</div>
            </div>
            <button class="cr-back" @click="store.goType()">‹ 返回</button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useCultivationRoomStore } from '../stores/cultivationRoom'
import { usePlayerStore } from '../stores/player'
import { useTechniqueBreakthroughStore } from '../stores/techniqueBreakthrough'

const store = useCultivationRoomStore()
const playerStore = usePlayerStore()
const tbStore = useTechniqueBreakthroughStore()
const { data: player } = storeToRefs(playerStore)

const techniques = computed(() => player.value?.techniques || [])
const skills = computed(() => player.value?.skills || [])

const progressLabel = computed(() => {
  const m = store.progress?.mode
  return m === 'technique' ? '功法修为' : m === 'skill' ? '斗技修为' : '斗气修为'
})

const cultPct = computed(() => {
  const cur = store.progress?.current ?? 0
  const max = store.progress?.max ?? 0
  return max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100))
})
const cultFull = computed(() => (store.progress?.max ?? 0) > 0 && (store.progress?.current ?? 0) >= (store.progress?.max ?? 0))

function tierName(tier) {
  const t = store.tiers.find((x) => x.tier === tier)
  return t?.name || `${['一', '二', '三'][(tier || 1) - 1]}阶修炼室`
}
function techIsFull(t) {
  return (t.max_cultivation ?? 0) > 0 && (t.cultivation ?? 0) >= (t.max_cultivation ?? 0)
}
function canBreakthroughTech(t) {
  return techIsFull(t) && (!t.max_level || t.level < t.max_level)
}
function openBreakthrough(t) { tbStore.open(t) }
function onPickTechnique(t) {
  if (techIsFull(t)) return
  store.enter(store.selectedTier, 'technique', t.id)
}
function skillIsMaxed(s) {
  return (s.max_level ?? 0) > 0 && (s.level ?? 0) >= (s.max_level ?? 0)
}
function onPickSkill(s) {
  if (skillIsMaxed(s)) return
  store.enter(store.selectedTier, 'skill', s.id)
}
const reasonText = computed(() => ({
  full: '修为已满，修炼自动结束。',
  insufficient: '金币耗尽，修炼自动结束。',
  stopped: '已停止修炼。',
}[store.stopReason] || ''))
</script>

<style scoped>
.cultivation-room-panel { width: 560px; max-width: 95vw; max-height: 86vh; display: flex; flex-direction: column; }
.cr-content { flex: 1; overflow-y: auto; padding: 16px 18px 18px; }

.cr-kind { margin-bottom: 18px; }
.cr-kind-title {
  font-size: 0.86rem; color: #c0b890; letter-spacing: 0.06em;
  margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid rgba(201, 168, 106, 0.2);
}
.cr-back {
  margin-top: 14px; padding: 4px 14px; font-size: 0.8rem; cursor: pointer;
  color: #a0a0b0; background: transparent; border: 1px solid var(--border); border-radius: var(--radius);
}
.cr-back:hover { color: #e0e0ec; }

.cr-tier-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.cr-tier-card {
  display: flex; flex-direction: column; gap: 4px; padding: 14px 10px; cursor: pointer;
  background: var(--bg-elev-2); border: 1px solid var(--border); border-radius: var(--radius); text-align: center;
  transition: border-color var(--transition), transform var(--transition);
}
.cr-tier-card:hover { border-color: var(--gold); transform: translateY(-2px); }
.cr-tier-name { font-size: 0.92rem; color: #e0d8c0; font-weight: 600; }
.cr-tier-meta { font-size: 0.72rem; color: #8aa0c0; }
.cr-tier-cost { font-size: 0.76rem; color: #f0c040; }

.cr-type-list { display: flex; flex-direction: column; gap: 10px; }
.cr-type-btn {
  display: flex; flex-direction: column; gap: 2px; padding: 12px 16px; cursor: pointer; text-align: left;
  background: var(--bg-elev-2); border: 1px solid var(--border); border-radius: var(--radius);
  transition: border-color var(--transition);
}
.cr-type-btn:not(:disabled):hover { border-color: var(--gold); }
.cr-type-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.cr-type-btn.is-disabled { opacity: 0.4; }
.cr-type-name { font-size: 0.92rem; color: #e0d8c0; font-weight: 600; }
.cr-type-desc { font-size: 0.74rem; color: #8a8a9a; }

.cr-tech-grid .tech-item { position: relative; cursor: pointer; }
.cr-tech-grid .tech-item:hover { filter: brightness(1.12); }
.cr-tech-grid .tech-item.is-full { cursor: default; opacity: 0.6; }
.cr-full-badge {
  position: absolute; top: 3px; right: 3px; padding: 0 4px; font-size: 0.62rem; font-weight: 700;
  color: #2a2010; background: #f0c040; border-radius: var(--radius-pill); line-height: 14px;
}
.cr-break-btn {
  position: absolute; right: 3px; bottom: 3px; padding: 1px 7px; font-size: 0.66rem; font-weight: 700;
  color: #2a2010; background: #6fbfa8; border: none; border-radius: var(--radius-pill); cursor: pointer; line-height: 15px;
}
.cr-break-btn:hover { filter: brightness(1.12); }
.cr-empty-inline { grid-column: 1 / -1; color: #6a6a78; font-size: 0.84rem; text-align: center; padding: 16px 0; }

.cr-reason { font-size: 0.82rem; color: #b0b0c0; background: rgba(40,40,56,0.4); border-radius: var(--radius); padding: 8px 12px; margin-bottom: 14px; }

/* 实时视图 */
.cr-live-head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--border); margin-bottom: 16px; }
.cr-live-tier { font-size: 1rem; color: #e0d8c0; font-weight: 600; }
.cr-live-money { font-size: 0.84rem; color: #f0c040; }
.cr-cult { margin-bottom: 18px; }
.cr-cult-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.cr-cult-label { font-size: 0.8rem; color: #b0b0c0; }
.cr-cult-val { font-size: 0.78rem; color: #6fbfa8; }
.cr-cult-bar { position: relative; width: 100%; height: 14px; background: rgba(0,0,0,0.4); border: 1px solid rgba(111,191,168,0.3); border-radius: 8px; overflow: hidden; }
.cr-cult-fill { height: 100%; width: 0; background: linear-gradient(90deg, #3a8f78, #6fbfa8); transition: width 0.35s ease; }
.cr-cult-bar.is-full .cr-cult-fill { background: linear-gradient(90deg, #d4a84a, #f0d070); }
.cr-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 16px; }
.cr-stat { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 10px 4px; background: var(--bg-elev-2); border: 1px solid var(--border); border-radius: var(--radius); }
.cr-stat em { font-style: normal; font-size: 1.12rem; color: #e0e0ec; font-weight: 600; }
.cr-stat .is-gain { color: #6fbfa8; }
.cr-stat .is-cost { color: #e08060; }
.cr-stat span { font-size: 0.72rem; color: #8a8a9a; }
.cr-spin { display: flex; align-items: center; justify-content: center; gap: 8px; color: #7a7a88; font-size: 0.82rem; padding: 8px 0 14px; }
.cr-stop-btn { width: 100%; padding: 8px 0; font-size: 0.86rem; color: #e08060; background: rgba(70,40,36,0.4); border: 1px solid #5a2e28; border-radius: var(--radius); cursor: pointer; transition: filter var(--transition); }
.cr-stop-btn:hover { filter: brightness(1.15); }
</style>
