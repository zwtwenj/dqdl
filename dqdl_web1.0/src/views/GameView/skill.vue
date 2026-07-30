<script setup>
/**
 * 斗技面板（mainContainer 的"斗技"tab 内容组件，与 playerDetails/backpack 同级）。
 *
 * 布局（背包同款格子样式）：
 *   ┌─────────────────────────────┐
 *   │  装配斗技（5 格，固定槽位 1~5）  │  ← 上方：drop 接收区，右键卸下
 *   ├─────────────────────────────┤
 *   │  玩家斗技（全部，无空格子）      │  ← 下方：draggable 拖拽源
 *   └─────────────────────────────┘
 *
 * 拖拽：下方斗技 → 上方槽位 = 装配（改 carry，不移动数据）。
 *   斗技装配的本质是修改 player.skill JSON 里某元素的 carry 字段（null ↔ 1~5），
 *   元素在数组里的位置/数量不变——所以拖拽不影响下方玩家斗技的数量。
 *   落槽是覆盖语义：目标槽位原主被顶下（carry 置空），被拖斗技占该槽。
 *
 * 数据：player.skills（后端 findOne 聚合数组），装配走 updatePlayerSkills（POST /player/:id/skill）。
 */
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useGameStore } from '@/stores/game'
import { updatePlayerSkills } from '@/api'
import { bus, BusEvents } from '@/utils/eventBus'

const playerStore = usePlayerStore()
const gameStore = useGameStore()
const playerId = computed(() => gameStore.playerId)

/** 全部斗技（后端聚合，含定义字段 + carry） */
const skills = computed(() => playerStore.player?.skills || [])

/** 装配槽位映射 {carry: skill}（carry∈1~5） */
const equippedMap = computed(() => {
    const map = {}
    skills.value.forEach((s) => {
        if (s.carry >= 1 && s.carry <= 5) map[s.carry] = s
    })
    return map
})

/** 玩家全部斗技（含已装备+未装备），下方列表展示用——有多少显示多少，无空格子 */
const allSkills = computed(() => skills.value)

// —— 图标路径（与 playerDetails 一致）——
const FALLBACK_ICON = '/icon/cl/cl-100.png'
function skillIconUrl(s) {
    const id = s?.item_id
    if (id?.startsWith('dj-')) return `/icon/skill/${id}.png`
    return FALLBACK_ICON
}
function onIconError(e) {
    if (e.target.src !== FALLBACK_ICON) e.target.src = FALLBACK_ICON
}

// —— tooltip 文案（v-tooltip，内联 HTML）——
const RANK_TIER = ['天阶', '地阶', '玄阶', '黄阶']
const RANK_GRADE = ['上品', '中品', '下品']
function rankLabel(rank) {
    if (!rank) return ''
    return (RANK_TIER[Math.floor(rank / 10)] || '') + (RANK_GRADE[rank % 10] || '')
}
function tipText(s) {
    if (!s) return ''
    const name = s.name || '未知斗技'
    const rank = rankLabel(s.rank)
    const lv = s.level || 1
    const dmg = s.base_damage ? `伤害：${s.base_damage}` : ''
    const cost = s.energy_cost ? `斗气消耗：${s.energy_cost}` : ''
    const desc = s.description || ''
    const equipped = s.carry ? '<span style="color:#7fd09a">[已装备]</span>' : ''
    return (
        `<div style="max-width:240px">` +
        `<div style="color:#f0d890;font-weight:bold">${name}${rank ? `<span style="color:#c0a060;font-weight:normal;margin-left:6px">${rank}</span>` : ''}${equipped}</div>` +
        `<div style="color:#7fd09a;margin-top:3px">等级 Lv.${lv}</div>` +
        (dmg ? `<div style="color:#c8b078;margin-top:2px">${dmg}</div>` : '') +
        (cost ? `<div style="color:#8ab0c8;margin-top:2px">${cost}</div>` : '') +
        (desc ? `<div style="color:#b0a878;margin-top:4px;line-height:1.5">${desc}</div>` : '') +
        `</div>`
    )
}

// —— 装配/卸下（仅改 carry，本地乐观同步 player.skills[] 与 player.skill 原始串）——
function parseRaw(raw) {
    try {
        const a = JSON.parse(raw || '[]')
        return Array.isArray(a) ? a : []
    } catch {
        return []
    }
}

/** 点击下方斗技 → 装入第一个空槽位 */
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

/** 拖拽落槽：被拖斗技原 carry 清空 → 目标槽位原主 carry 清空 → 被拖斗技落位 */
function onDropSlot(slot, e) {
    e.preventDefault()
    const id = Number(e.dataTransfer.getData('text/plain'))
    if (!id) return
    applyCarryChange((raw) => {
        raw.forEach((x) => {
            if (x.id === id) x.carry = null
        })
        raw.forEach((x) => {
            if (x.carry === slot) x.carry = null
        })
        const t = raw.find((x) => x.id === id)
        if (t) t.carry = slot
    })
}

/** 右键槽位 → 卸下 */
function onSlotContextmenu(slot) {
    applyCarryChange((raw) => {
        const t = raw.find((x) => x.carry === slot)
        if (t) t.carry = null
    })
}

/** 统一入口：改 raw 的 carry → 本地乐观同步 skills → 提交后端 */
async function applyCarryChange(mutate) {
    const raw = parseRaw(playerStore.player?.skill)
    mutate(raw)
    // 本地同步富化数组里对应斗技的 carry（避免重新拉取）
    const carryById = new Map(raw.map((x) => [x.id, x.carry ?? null]))
    const synced = skills.value.map((s) => ({
        ...s,
        carry: carryById.has(s.id) ? carryById.get(s.id) : s.carry,
    }))
    playerStore.player = { ...playerStore.player, skill: JSON.stringify(raw), skills: synced }
    try {
        await updatePlayerSkills(playerId.value, JSON.stringify(raw))
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '保存斗技失败' })
        // 失败回滚：重新拉取
        playerStore.load()
    }
}
</script>

<template>
    <div class="dqdl-skill">
        <!-- 上方：装配斗技（5 格固定槽位） -->
        <div class="skill-equipped">
            <div class="skill-section-title">装配斗技</div>
            <div class="skill-slots">
                <div
                    v-for="slot in 5"
                    :key="slot"
                    class="skill-cell"
                    :class="{ 'has-item': equippedMap[slot] }"
                    v-tooltip="tipText(equippedMap[slot])"
                    @dragover.prevent
                    @drop="onDropSlot(slot, $event)"
                    @contextmenu.prevent="onSlotContextmenu(slot)"
                >
                    <template v-if="equippedMap[slot]">
                        <img
                            class="slot-icon"
                            :src="skillIconUrl(equippedMap[slot])"
                            :alt="equippedMap[slot].name"
                            @error="onIconError"
                        >
                        <span class="slot-level">Lv.{{ equippedMap[slot].level || 1 }}</span>
                    </template>
                    <span v-else class="slot-empty">{{ slot }}</span>
                </div>
            </div>
        </div>

        <div class="skill-divider"></div>

        <!-- 下方：玩家斗技（全部，无空格子） -->
        <div class="skill-inventory">
            <div class="skill-section-title">玩家斗技</div>
            <div v-if="!allSkills.length" class="skill-empty">尚未习得任何斗技</div>
            <div v-else class="skill-grid">
                <div
                    v-for="s in allSkills"
                    :key="s.id"
                    class="skill-cell inventory-cell"
                    :class="{ 'has-item': true, equipped: s.carry }"
                    draggable="true"
                    v-tooltip="tipText(s)"
                    @click="onEquip(s)"
                    @dragstart="onDragStart(s, $event)"
                >
                    <img
                        class="slot-icon"
                        :src="skillIconUrl(s)"
                        :alt="s.name"
                        @error="onIconError"
                    >
                    <span class="slot-level">Lv.{{ s.level || 1 }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.dqdl-skill{
    width: 100%;
    padding: 10px;
    text-align: left;
}
.skill-section-title{
    font-size: 14px;
    font-weight: bold;
    color: #3a2a1a;
    margin-bottom: 8px;
}
/* 装配槽：5 个并排 */
.skill-slots{
    display: flex;
    gap: 6px;
}
/* 玩家斗技网格 */
.skill-grid{
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    gap: 4px;
}
/* 格子（复用背包 .backpack-cell 样式） */
.skill-cell{
    width: 56px;
    height: 56px;
    background: url("/static/item-cell-bg.gif");
    background-size: 100% 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    &.has-item{
        cursor: grab;
    }
    &.has-item:active{
        cursor: grabbing;
    }
    /* 已装备的下方斗技：标记边框 */
    &.equipped{
        border: 1px solid #7fd09a;
        box-sizing: border-box;
    }
    .slot-icon{
        width: 90%;
        height: 90%;
        object-fit: contain;
        pointer-events: none;
    }
    .slot-level{
        position: absolute;
        bottom: 1px;
        right: 2px;
        font-size: 11px;
        color: #fff;
        text-shadow: 1px 1px 2px #000;
        pointer-events: none;
    }
    .slot-empty{
        color: #b0a890;
        font-size: 18px;
        opacity: 0.5;
    }
}
.skill-divider{
    height: 1px;
    background: #c8c0b0;
    margin: 14px 0;
}
.skill-empty{
    color: #8a7a60;
    text-align: center;
    padding: 30px 0;
}
.inventory-cell{
    cursor: pointer;
}
</style>
