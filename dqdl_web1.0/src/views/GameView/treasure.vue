<script setup>
/**
 * 宝物面板（mainContainer 的"宝物"tab 内容组件，与 skill/backpack 同级）。
 *
 * 布局（与斗技 skill.vue 对称，复用背包格子样式）：
 *   ┌─────────────────────────────┐
 *   │  装配宝物（5 格，固定槽位 1~5）  │  ← 上方：drop 接收区，右键卸下
 *   ├─────────────────────────────┤
 *   │  玩家宝物（背包中 type=宝物）   │  ← 下方：draggable 拖拽源（只读视图，不移动数据）
 *   └─────────────────────────────┘
 *
 * 拖拽：仅"下方 → 上方槽"单方向（不支持已装备宝物槽间挪动）。
 *   装备本质是跨表移动：背包扣物品 + 写入 player.treasures 的 slot N（后端事务）。
 *   下方列表是背包宝物的只读筛选视图，装备后背包扣除、列表自动刷新，不影响其他宝物。
 * 卸下：右键上方槽 → 从 treasures 移除 + 返还物品到背包最小空 slot（后端 addItem 自动）。
 *
 * 不乐观更新（跨 player.treasures + backpack 两表），走后端返回的 player + 重拉背包。
 *
 * 数据：player.treasures（后端聚合，含定义）+ backpackStore（背包宝物）+ getAllTreasures（定义缓存）。
 */
import { ref, computed, onMounted } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useBackpackStore } from '@/stores/backpack'
import { useGameStore } from '@/stores/game'
import { useItem, unequipTreasure } from '@/api'
import { getAllTreasures } from '@/api/treasure'
import { bus, BusEvents } from '@/utils/eventBus'

const playerStore = usePlayerStore()
const backpackStore = useBackpackStore()
const gameStore = useGameStore()
const playerId = computed(() => gameStore.playerId)

/** 已装备宝物（按 slot 索引） */
const treasures = computed(() => playerStore.player?.treasures || [])
function slotTreasure(slot) {
    return treasures.value.find((t) => Number(t.slot) === slot) || null
}

/** 玩家背包中的宝物物品（下方列表） */
const backpackTreasures = computed(() =>
    backpackStore.slots.filter((s) => s.item?.type === '宝物'),
)

// —— treasure 定义缓存（item_id → 定义，tooltip 显示属性用）——
const treasureDefs = ref({})
const parseJson = (s) => {
    try {
        return JSON.parse(s)
    } catch {
        return {}
    }
}
async function loadTreasureDefs() {
    try {
        const list = await getAllTreasures()
        const map = {}
        for (const t of list || []) {
            map[t.item_id] = {
                name: t.name,
                item_id: t.item_id,
                category: t.category,
                description: t.description,
                stats: parseJson(t.stats),
                effects: parseJson(t.effects),
            }
        }
        treasureDefs.value = map
    } catch (e) {
        /* 忽略，tooltip 退化为背包 item 自带信息 */
    }
}

// —— 图标路径（bw- 前缀）——
const FALLBACK_ICON = '/icon/technique/bw-001.png'
function treasureIconUrl(t) {
    const id = t?.item_id
    if (id && id.startsWith('bw-')) return `/icon/technique/${id}.png`
    return FALLBACK_ICON
}
function onIconError(e) {
    if (e.target.src !== FALLBACK_ICON) e.target.src = FALLBACK_ICON
}

// —— tooltip 文案（v-tooltip，内联 HTML）——
const ATTR_LABEL = {
    power: '力量',
    intelligence: '智力',
    quick: '敏捷',
    stamina: '体质',
    lucky: '运气',
    hp: '生命',
    energy: '斗气',
}
function statsText(stats) {
    const s = stats || {}
    return Object.keys(s)
        .map((k) => `${ATTR_LABEL[k] || k}+${s[k]}`)
        .join(' ')
}
/** 已装备宝物 tooltip（player.treasures 元素，含定义） */
function tipEquipped(t) {
    if (!t) return ''
    const name = t.name || '未知宝物'
    const cat = t.category || '饰品'
    const stats = statsText(t.stats)
    const desc = t.description || ''
    const equipped = '<span style="color:#7fd09a">[已装备]</span>'
    return (
        `<div style="max-width:240px">` +
        `<div style="color:#f0d890;font-weight:bold">${name} <span style="color:#c0a060;font-weight:normal">[${cat}]</span> ${equipped}</div>` +
        (stats ? `<div style="color:#c8b078;margin-top:3px">${stats}</div>` : '') +
        (desc ? `<div style="color:#b0a878;margin-top:4px;line-height:1.5">${desc}</div>` : '') +
        `</div>`
    )
}
/** 背包宝物 tooltip（用定义缓存补充 stats，无定义则退化） */
function tipBackpack(bp) {
    const def = treasureDefs.value[bp.item_id]
    const name = def?.name || bp.item?.name || '未知宝物'
    const cat = def?.category || '饰品'
    const stats = statsText(def?.stats)
    const desc = def?.description || bp.item?.description || ''
    return (
        `<div style="max-width:240px">` +
        `<div style="color:#f0d890;font-weight:bold">${name} <span style="color:#c0a060;font-weight:normal">[${cat}]</span></div>` +
        (stats ? `<div style="color:#c8b078;margin-top:3px">${stats}</div>` : '') +
        (desc ? `<div style="color:#b0a878;margin-top:4px;line-height:1.5">${desc}</div>` : '') +
        `<div style="color:#8a7a60;margin-top:4px;font-size:11px">拖到上方槽位装备</div>` +
        `</div>`
    )
}

// —— 装备/卸下（跨表，走后端，不乐观更新）——
const equipping = ref(false)

/** 拖拽开始：记录宝物 item_id */
function onDragStart(bp, e) {
    e.dataTransfer.setData('text/plain', String(bp.item_id))
    e.dataTransfer.effectAllowed = 'move'
}

/** 拖到槽位：装备（背包扣物品 + 写 treasures.slot=N） */
async function onDropSlot(slot, e) {
    e.preventDefault()
    if (equipping.value) return
    const itemId = e.dataTransfer.getData('text/plain')
    if (!itemId) return
    // 目标槽已被占用：提示（不支持槽间挪动）
    if (slotTreasure(slot)) {
        bus.emit(BusEvents.TOAST, { type: 'info', message: `槽位 ${slot} 已被占用，请先卸下` })
        return
    }
    equipping.value = true
    try {
        const res = await useItem(playerId.value, itemId, slot)
        if (res?.player) {
            bus.emit(BusEvents.PLAYER_UPDATE, { player: res.player })
            await backpackStore.reload(playerId.value)
            bus.emit(BusEvents.TOAST, { type: 'success', message: '装备成功' })
        }
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '装备失败' })
    } finally {
        equipping.value = false
    }
}

/** 点击下方宝物：装备到第一个空槽（兜底，不指定槽位） */
async function onEquip(bp) {
    if (equipping.value) return
    equipping.value = true
    try {
        const res = await useItem(playerId.value, bp.item_id)
        if (res?.player) {
            bus.emit(BusEvents.PLAYER_UPDATE, { player: res.player })
            await backpackStore.reload(playerId.value)
            bus.emit(BusEvents.TOAST, { type: 'success', message: `装备了 ${bp.item?.name || '宝物'}` })
        }
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '装备失败' })
    } finally {
        equipping.value = false
    }
}

/** 右键上方槽 → 卸下（返还到背包最小空 slot） */
async function onSlotContextmenu(slot) {
    if (equipping.value) return
    if (!slotTreasure(slot)) return
    equipping.value = true
    try {
        const res = await unequipTreasure(playerId.value, slot)
        if (res?.player) {
            bus.emit(BusEvents.PLAYER_UPDATE, { player: res.player })
            await backpackStore.reload(playerId.value)
            bus.emit(BusEvents.TOAST, { type: 'success', message: '已卸下宝物' })
        }
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '卸下失败' })
    } finally {
        equipping.value = false
    }
}

onMounted(() => {
    loadTreasureDefs()
})
</script>

<template>
    <div class="dqdl-treasure">
        <!-- 上方：装配宝物（5 格固定槽位） -->
        <div class="treasure-equipped">
            <div class="treasure-section-title">装配宝物</div>
            <div class="treasure-slots">
                <div
                    v-for="slot in 5"
                    :key="slot"
                    class="treasure-cell"
                    :class="{ 'has-item': slotTreasure(slot) }"
                    v-tooltip="tipEquipped(slotTreasure(slot))"
                    @dragover.prevent
                    @drop="onDropSlot(slot, $event)"
                    @contextmenu.prevent="onSlotContextmenu(slot)"
                >
                    <template v-if="slotTreasure(slot)">
                        <img
                            class="slot-icon"
                            :src="treasureIconUrl(slotTreasure(slot))"
                            :alt="slotTreasure(slot).name"
                            @error="onIconError"
                        >
                    </template>
                    <span v-else class="slot-empty">{{ slot }}</span>
                </div>
            </div>
        </div>

        <div class="treasure-divider"></div>

        <!-- 下方：玩家宝物（背包中 type=宝物，无空格子） -->
        <div class="treasure-inventory">
            <div class="treasure-section-title">玩家宝物</div>
            <div v-if="!backpackTreasures.length" class="treasure-empty">背包中没有宝物</div>
            <div v-else class="treasure-grid">
                <div
                    v-for="bp in backpackTreasures"
                    :key="bp.item_id"
                    class="treasure-cell inventory-cell has-item"
                    draggable="true"
                    v-tooltip="tipBackpack(bp)"
                    @click="onEquip(bp)"
                    @dragstart="onDragStart(bp, $event)"
                >
                    <img
                        class="slot-icon"
                        :src="treasureIconUrl({ item_id: bp.item_id })"
                        :alt="bp.item?.name"
                        @error="onIconError"
                    >
                    <span v-if="bp.count > 1" class="slot-count">{{ bp.count }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.dqdl-treasure{
    width: 100%;
    padding: 10px;
    text-align: left;
}
.treasure-section-title{
    font-size: 14px;
    font-weight: bold;
    color: #3a2a1a;
    margin-bottom: 8px;
}
/* 装配槽：5 个并排 */
.treasure-slots{
    display: flex;
    gap: 6px;
}
/* 玩家宝物网格 */
.treasure-grid{
    display: grid;
    grid-template-columns: repeat(16, 1fr);
    gap: 4px;
}
/* 格子（复用背包 .backpack-cell 样式） */
.treasure-cell{
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
    .slot-icon{
        width: 90%;
        height: 90%;
        object-fit: contain;
        pointer-events: none;
    }
    .slot-count{
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
.treasure-divider{
    height: 1px;
    background: #c8c0b0;
    margin: 14px 0;
}
.treasure-empty{
    color: #8a7a60;
    text-align: center;
    padding: 30px 0;
}
.inventory-cell{
    cursor: pointer;
}
</style>
