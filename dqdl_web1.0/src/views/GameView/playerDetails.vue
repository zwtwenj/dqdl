<script setup>
/**
 * 人物面板（内嵌版）：展示玩家完整属性/功法/斗技/宝物。
 * 数据全部来自 playerStore（不接 props），与 playerInfo 共享同一份数据。
 * 移植自老版 PlayerPanel，去掉弹窗/拖拽/突破（mainContainer 内嵌不需要）。
 */
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'

const playerStore = usePlayerStore()
const player = computed(() => playerStore.player)

// —— 五维属性 ——
const ATTRS = [
  { label: '力量', key: 'power', color: '#e85040' },
  { label: '智力', key: 'intelligence', color: '#4ab8e8' },
  { label: '敏捷', key: 'quick', color: '#8ae870' },
  { label: '体质', key: 'stamina', color: '#e8a840' },
  { label: '运气', key: 'lucky', color: '#c8a0e8' },
]
/** final_attrs 优先（含功法/宝物加成） */
function attrVal(key) {
  const fa = player.value?.final_attrs
  return fa?.[key] ?? 0
}

// —— 进度条 ——
const maxHp = computed(() => playerStore.maxHp)
const maxEnergy = computed(() => playerStore.maxEnergy)
const maxCult = computed(() => player.value?.level_cultivation ?? 100)
const hpPct = computed(() => Math.min(100, ((player.value?.hp ?? 0) / Math.max(1, maxHp.value)) * 100))
const energyPct = computed(() => Math.min(100, ((player.value?.energy ?? 0) / Math.max(1, maxEnergy.value)) * 100))
const cultPct = computed(() => Math.min(100, ((player.value?.cultivation ?? 0) / Math.max(1, maxCult.value)) * 100))

// —— 功法（已装备） ——
const techniques = computed(() => {
  const agg = player.value?.techniques
  return Array.isArray(agg) ? agg.filter((t) => t.equipped) : []
})

// —— 斗技（已装备 carry 1~5） ——
const skills = computed(() => {
  const agg = player.value?.skills
  if (!Array.isArray(agg)) return []
  return agg.filter((s) => s.carry >= 1 && s.carry <= 5)
})

// —— 宝物（已装备，按 slot 排序） ——
const treasures = computed(() => {
  const list = player.value?.treasures
  if (!Array.isArray(list)) return []
  return [...list].sort((a, b) => (a.slot || 0) - (b.slot || 0))
})

// —— 图标路径 ——
const FALLBACK_ICON = '/icon/cl/cl-100.png'
function techniqueIconUrl(t) {
  const id = t?.item_id
  if (id?.startsWith('gf-')) return `/icon/technique/${id}.png`
  return FALLBACK_ICON
}
function skillIconUrl(s) {
  const id = s?.item_id
  if (id?.startsWith('dj-')) return `/icon/skill/${id}.png`
  return FALLBACK_ICON
}
const TREASURE_FALLBACK = '/icon/technique/bw-001.png'
function treasureIconUrl(t) {
  const id = t?.item_id
  if (id?.startsWith('bw-')) return `/icon/technique/${id}.png`
  return TREASURE_FALLBACK
}
function onIconError(e) {
  if (e.target.src !== FALLBACK_ICON && e.target.src !== TREASURE_FALLBACK) e.target.src = FALLBACK_ICON
}

// —— 宝物属性文案 ——
const ATTR_LABEL = { power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质', lucky: '运气', hp: '生命', energy: '斗气' }
function treasureStatText(t) {
  const s = t?.stats || {}
  return Object.keys(s).map((k) => `${ATTR_LABEL[k] || k}+${s[k]}`).join(' ')
}
</script>

<template>
    <div class="player-details" v-if="player">
        <!-- 等阶名 -->
        <div class="level-row">
            <span class="char-title">{{ player.level_name || ('Lv.' + player.level) }}</span>
            <span class="char-name">{{ player.name }}</span>
        </div>

        <!-- 气血/斗气/修为 -->
        <div class="detail-section">
            <div class="vital-row">
                <span class="vital-label">气血</span>
                <div class="vital-track">
                    <div class="vital-fill hp" :style="{ width: hpPct + '%' }"></div>
                    <span class="vital-text">{{ player.hp }} / {{ maxHp }}</span>
                </div>
            </div>
            <div class="vital-row">
                <span class="vital-label">斗气</span>
                <div class="vital-track">
                    <div class="vital-fill energy" :style="{ width: energyPct + '%' }"></div>
                    <span class="vital-text">{{ player.energy }} / {{ maxEnergy }}</span>
                </div>
            </div>
            <div class="vital-row">
                <span class="vital-label">修为</span>
                <div class="vital-track">
                    <div class="vital-fill cult" :style="{ width: cultPct + '%' }"></div>
                    <span class="vital-text">{{ player.cultivation }} / {{ maxCult }}</span>
                </div>
            </div>
        </div>

        <!-- 五维属性 -->
        <div class="detail-section">
            <div class="section-title">基础属性</div>
            <div class="attr-rows">
                <div v-for="a in ATTRS" :key="a.key" class="attr-row">
                    <span class="attr-accent" :style="{ background: a.color }"></span>
                    <span class="attr-name">{{ a.label }}</span>
                    <span class="attr-value" :style="{ color: a.color }">{{ attrVal(a.key) }}</span>
                </div>
            </div>
        </div>

        <!-- 功法 -->
        <div class="detail-section">
            <div class="section-title">功法</div>
            <div v-if="techniques.length" class="item-list">
                <div v-for="(t, i) in techniques" :key="'t'+i" class="item-row" v-tooltip="t.name || '未知'">
                    <img class="item-icon" :src="techniqueIconUrl(t)" @error="onIconError">
                    <span class="item-name">{{ t.name || t.skill_name || '未知' }}</span>
                    <span class="item-level">Lv.{{ t.level ?? 1 }}</span>
                </div>
            </div>
            <div v-else class="empty-hint">— 尚未装备 —</div>
        </div>

        <!-- 斗技 -->
        <div class="detail-section">
            <div class="section-title">斗技</div>
            <div v-if="skills.length" class="item-list">
                <div v-for="(s, i) in skills" :key="'s'+i" class="item-row" v-tooltip="s.name || '未知'">
                    <img class="item-icon" :src="skillIconUrl(s)" @error="onIconError">
                    <span class="item-name">{{ s.name || s.skill_name || '未知' }}</span>
                </div>
            </div>
            <div v-else class="empty-hint">— 尚未装备 —</div>
        </div>

        <!-- 宝物 -->
        <div class="detail-section">
            <div class="section-title">宝物</div>
            <div v-if="treasures.length" class="item-list">
                <div v-for="(t, i) in treasures" :key="'tr'+i" class="item-row"
                    v-tooltip="`${t.name || '宝物'}<br/>${treasureStatText(t)}`">
                    <img class="item-icon" :src="treasureIconUrl(t)" @error="onIconError">
                    <span class="item-name">{{ t.name || '宝物' }}</span>
                </div>
            </div>
            <div v-else class="empty-hint">— 尚未装备 —</div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.player-details{
    padding: 4px;
    height: 100%;
    overflow-y: auto;
}
.level-row{
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    .char-title{
        font-weight: bold;
        font-size: 15px;
        color: var(--accent);
    }
    .char-name{
        font-size: 13px;
        color: var(--text-dim);
    }
}
.detail-section{
    margin-bottom: 12px;
}
.section-title{
    font-weight: bold;
    font-size: 13px;
    color: var(--text);
    margin-bottom: 6px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 3px;
}
/* 进度条 */
.vital-row{
    display: flex;
    align-items: center;
    margin-bottom: 5px;
    .vital-label{
        width: 36px;
        font-size: 12px;
        color: var(--text-dim);
    }
    .vital-track{
        flex: 1;
        height: 16px;
        background: var(--input-bg);
        border: 1px solid var(--border);
        border-radius: 2px;
        position: relative;
        overflow: hidden;
        .vital-fill{
            height: 100%;
            transition: width 0.3s;
            &.hp{ background: #d9404a; }
            &.energy{ background: #3a86e0; }
            &.cult{ background: #f0c040; }
        }
        .vital-text{
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            color: #fff;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
        }
    }
}
/* 五维属性 */
.attr-rows{
    .attr-row{
        display: flex;
        align-items: center;
        padding: 3px 0;
        .attr-accent{
            width: 4px;
            height: 14px;
            margin-right: 8px;
            border-radius: 1px;
        }
        .attr-name{
            font-size: 12px;
            color: var(--text);
            width: 40px;
        }
        .attr-value{
            font-size: 13px;
            font-weight: bold;
        }
    }
}
/* 功法/斗技/宝物列表 */
.item-list{
    .item-row{
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 3px 0;
        cursor: default;
        .item-icon{
            width: 24px;
            height: 24px;
            object-fit: contain;
        }
        .item-name{
            font-size: 12px;
            color: var(--text);
        }
        .item-level{
            font-size: 11px;
            color: var(--text-dim);
        }
    }
}
.empty-hint{
    font-size: 12px;
    color: var(--text-faint);
    text-align: center;
    padding: 8px 0;
}
</style>
