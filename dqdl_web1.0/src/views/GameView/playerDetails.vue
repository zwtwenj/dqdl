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

// —— tooltip 文案（v-tooltip，内联 HTML）——
function techniqueTip(t) {
  if (!t) return ''
  const lines = [`<span style="font-size:14px;font-weight:bold;color:#f0c040;">${t.name || '未知功法'}</span>`]
  if (t.level) lines.push(`<span style="color:#7fd09a;">等级 Lv.${t.level}</span>`)
  if (t.description) lines.push(`<div style="color:#d9d0c2;max-width:220px;line-height:1.5;">${t.description}</div>`)
  return lines.join('<br/>')
}
function skillTip(s) {
  if (!s) return ''
  const lines = [`<span style="font-size:14px;font-weight:bold;color:#f0c040;">${s.name || '未知斗技'}</span>`]
  if (s.level) lines.push(`<span style="color:#7fd09a;">等级 Lv.${s.level}</span>`)
  if (s.attr) lines.push(`<span style="color:#c8a0ff;">属性：${s.attr}</span>`)
  if (s.description) lines.push(`<div style="color:#d9d0c2;max-width:220px;line-height:1.5;">${s.description}</div>`)
  return lines.join('<br/>')
}
function treasureTip(t) {
  if (!t) return ''
  const lines = [`<span style="font-size:14px;font-weight:bold;color:#f0c040;">${t.name || '宝物'}</span>`]
  if (t.category) lines.push(`<span style="color:#c8a0ff;">类型：${t.category}</span>`)
  const stats = treasureStatText(t)
  if (stats) lines.push(`<span style="color:#c8b078;">${stats}</span>`)
  if (t.description) lines.push(`<div style="color:#d9d0c2;max-width:220px;line-height:1.5;">${t.description}</div>`)
  return lines.join('<br/>')
}
</script>

<template>
    <div class="player-details" v-if="player">
        <div class="player-details-left">
            <div class="player-details-border">
                <div class="player-details-title">
                    基本信息
                </div>
                <div class="player-details-module">
                    <!-- 等阶名 -->
                    <div class="level-row">
                        <div class="char-name">角色：{{ player.name }}</div>
                        <div class="char-title">境界：{{ player.level_name || ('Lv.' + player.level) }}</div>
                    </div>

                    <!-- 气血/斗气/修为（复用 playerInfo 的 player-hp-mp-cult gif 进度条样式） -->
                    <div class="player-cult">
                        <div class="player-cult-left">修为：</div>
                        <div class="player-cult-point-bg">
                            <div class="player-cult-point" :style="{ width: cultPct + '%' }"></div>
                        </div>
                    </div>
                    <div class="player-hp">
                        <div class="player-hp-left">气血：</div>
                        <div class="player-hp-point-bg">
                            <div class="player-hp-point" :style="{ width: hpPct + '%' }"></div>
                        </div>
                    </div>
                    <div class="player-energy">
                        <div class="player-energy-left">斗气：</div>
                        <div class="player-energy-point-bg">
                            <div class="player-energy-point" :style="{ width: energyPct + '%' }"></div>
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
                </div>
            </div>
        </div>

        <div class="player-details-right">
            <div class="player-details-border">
                <div class="player-details-module">
                    <!-- 功法 -->
                    <div class="detail-section">
                        <div class="section-title">功法</div>
                        <div v-if="techniques.length" class="item-list">
                            <div v-for="(t, i) in techniques" :key="'t'+i" class="item-cell" v-tooltip="techniqueTip(t)">
                                <img class="cell-icon" :src="techniqueIconUrl(t)" @error="onIconError">
                                <span class="cell-level">Lv.{{ t.level ?? 1 }}</span>
                            </div>
                        </div>
                        <div v-else class="empty-hint">— 尚未装备 —</div>
                    </div>

                    <!-- 斗技 -->
                    <div class="detail-section">
                        <div class="section-title">斗技</div>
                        <div v-if="skills.length" class="item-list">
                            <div v-for="(s, i) in skills" :key="'s'+i" class="item-cell" v-tooltip="skillTip(s)">
                                <img class="cell-icon" :src="skillIconUrl(s)" @error="onIconError">
                            </div>
                        </div>
                        <div v-else class="empty-hint">— 尚未装备 —</div>
                    </div>

                    <!-- 宝物 -->
                    <div class="detail-section">
                        <div class="section-title">宝物</div>
                        <div v-if="treasures.length" class="item-list">
                            <div v-for="(t, i) in treasures" :key="'tr'+i" class="item-cell" v-tooltip="treasureTip(t)">
                                <img class="cell-icon" :src="treasureIconUrl(t)" @error="onIconError">
                            </div>
                        </div>
                        <div v-else class="empty-hint">— 尚未装备 —</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.player-details{
    padding: 4px;
    height: calc(100% - 10px);
    overflow-y: auto;
    display: flex;
    gap: 10px;
    .player-details-left{
        flex-shrink: 0;          /* 不被 flex 压缩 */
        align-self: flex-start;  /* 不被 flex 纵向拉伸，高度由内部元素撑开 */
        width: 220px;
        border: 1px solid #a69b8b;
        padding: 2px;
        .player-details-title{
            background: url("/static/mission-top.gif") no-repeat;
            background-size: 100% 100%;
            line-height: 24px;
            color: #fff;
            text-align: center;
        }
    }
    .player-details-right{
        flex: 1;
        height: 100%;
        border: 1px solid #a69b8b;
        padding: 2px;
    }
}
.player-details-border{
    border: 1px solid #a69b8b;
    background: #d9d2cc;
    height: 100%;
    overflow: hidden;
}
.player-details-module{
    padding: 10px;
    height: 100%;
    overflow: hidden;
    overflow-y: auto;
}
.level-row{
    .char-name, .char-title{
        margin-bottom: 10px;
    }
}
.detail-section{
    border-top: 1px solid var(--border);
    padding: 7px 0;
}
.section-title{
    font-weight: bold;
    font-size: 13px;
    color: var(--text);
    margin-bottom: 7px;
}
/* 进度条 */
/* 气血/斗气/修为：复用 playerInfo 的 player-hp-mp-cult gif 进度条样式 */
.player-cult, .player-hp, .player-energy{
    display: flex;
    align-items: center;
    margin-bottom: 7px;
}
.player-cult-point-bg, .player-hp-point-bg, .player-energy-point-bg{
    flex: 1;
    background: url("/static/point-bar-bg.gif") no-repeat;
    background-size: 100% 100%;
    height: 14px;
    padding: 3px;
    overflow: hidden;
    .player-cult-point{
        height: 100%;
        background: url("/static/point-bar-1.gif") no-repeat;
        background-size: 137px 100%;
        background-position: left center;
    }
    .player-hp-point{
        height: 100%;
        background: url("/static/point-bar-2.gif") no-repeat;
        background-size: 137px 100%;
        background-position: left center;
    }
    .player-energy-point{
        height: 100%;
        background: url("/static/point-bar-3.gif") no-repeat;
        background-size: 137px 100%;
        background-position: left center;
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
    display: flex;
    gap: 5px;
    .item-cell{
        width: 100%;
        aspect-ratio: 1 / 1;
        background: url("/static/item-cell-bg.gif");
        width: 50px;
        height: 50px;
        background-size: 100% 100%;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: default;
        .cell-icon{
            width: 90%;
            height: 90%;
            object-fit: contain;
            pointer-events: none;
        }
        .cell-level{
            position: absolute;
            bottom: 1px;
            right: 2px;
            font-size: 11px;
            color: #fff;
            text-shadow: 1px 1px 2px #000;
            pointer-events: none;
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
