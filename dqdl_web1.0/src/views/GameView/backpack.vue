<script setup>
/**
 * 背包组件：16×7=112 格/页 × 3 页 = 336 格。
 * 支持分页切换、物品拖拽交换、整理排序。
 * 数据来源：backpackStore（内存常驻）。
 */
import { ref, computed, onMounted } from 'vue'
import { useBackpackStore } from '@/stores/backpack'
import { useGameStore } from '@/stores/game'
import { usePlayerStore } from '@/stores/player'
import { useItem } from '@/api'
import { bus, BusEvents } from '@/utils/eventBus'
import LongButton from '@/components1/longButton.vue'
import Pager from '@/components1/pager.vue'

const backpackStore = useBackpackStore()
const game = useGameStore()
const playerStore = usePlayerStore()

// —— 网格规格 ——
const SLOTS_PER_PAGE = 16 * 7   // 112
const TOTAL_PAGES = 3           // 336 格
const FALLBACK_ICON = '/icon/cl/cl-100.png'

const currentPage = ref(1)

onMounted(async () => {
  const pid = game.playerId
  if (pid) await backpackStore.load(pid)
})

/** slot→data 映射 */
const slotMap = computed(() => {
  const map = new Map()
  for (const s of backpackStore.slots) {
    if (s.slot) map.set(s.slot, s)
  }
  return map
})

const money = computed(() => backpackStore.money)

/** 物品图标路径推导 */
function iconUrl(item) {
  if (!item) return FALLBACK_ICON
  if (item.icon) return item.icon
  const id = item.item_id
  if (id?.startsWith('cl-')) return `/icon/cl/${id}.png`
  if (id?.startsWith('mh-')) return `/icon/mh/${id}.png`
  if (id?.startsWith('yb-')) return `/icon/alchemy/${id}.png`
  return FALLBACK_ICON
}
function onIconError(e) {
  if (e.target.src !== FALLBACK_ICON) e.target.src = FALLBACK_ICON
}

/** 格子 tooltip 文案：名字 + 类型 + 描述 + 出售价（有物品才显示）。
 *  用内联样式控制排版（v-tooltip 用 innerHTML 渲染，支持标签）。 */
const TYPE_LABEL = { '丹药': '丹药', '药材': '药材', '宝物': '宝物', '装备': '装备', '材料': '材料' }
function tipText(data) {
  if (!data?.item) return ''
  const it = data.item
  const lines = []
  // 标题：大一号 + 金色粗体
  lines.push(`<span style="font-size:14px;font-weight:bold;color:#f0c040;">${it.name || data.item_id}</span>`)
  if (it.type) lines.push(`<span style="color:#c8a0ff;">类型：${TYPE_LABEL[it.type] || it.type}</span>`)
  if (it.description) lines.push(`<div style="color:#d9d0c2;max-width:200px;word-break:break-all;line-height:1.5;">${it.description}</div>`)
  if (data.sell_price != null) lines.push(`<span style="color:#50c878;">出售 ${data.sell_price} 金</span>`)
  // 可使用物品提示双击
  if (isUsable(data)) lines.push(`<span style="color:#80c8ff;">双击使用</span>`)
  return lines.join('<br/>')
}

/** 当前页的格子（112 个） */
const pageSlots = computed(() => {
  const start = (currentPage.value - 1) * SLOTS_PER_PAGE + 1
  const result = []
  for (let i = 0; i < SLOTS_PER_PAGE; i++) {
    const slotNum = start + i
    result.push({ slot: slotNum, data: slotMap.value.get(slotNum) || null })
  }
  return result
})

// —— 分页 ——
function prevPage() {
  if (currentPage.value > 1) currentPage.value--
}
function nextPage() {
  if (currentPage.value < TOTAL_PAGES) currentPage.value++
}

// —— 拖拽交换 ——
const draggingSlot = ref(null)

function onDragStart(e, slotNum) {
  if (!slotMap.value.has(slotNum)) { e.preventDefault(); return }
  draggingSlot.value = slotNum
  e.dataTransfer.effectAllowed = 'move'
  const icon = e.currentTarget.querySelector('.slot-icon')
  if (icon) e.dataTransfer.setDragImage(icon, icon.offsetWidth / 2, icon.offsetHeight / 2)
}
function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }
function onDragEnd() { draggingSlot.value = null; clearPagerDrag() }
async function onDrop(e, toSlot) {
  e.preventDefault()
  const fromSlot = draggingSlot.value
  onDragEnd()
  if (fromSlot === null || fromSlot === toSlot) return
  try {
    await backpackStore.move(game.playerId, fromSlot, toSlot)
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '移动失败' })
  }
}

// —— 拖拽到翻页按钮自动翻页 ——
let pagerDragTimer = null
let pagerDragArmed = false
function startPagerDrag(dir) {
  if (pagerDragArmed) return
  pagerDragArmed = true
  const fn = dir === 'next' ? nextPage : prevPage
  pagerDragTimer = setTimeout(() => { fn(); pagerDragTimer = setInterval(fn, 1000) }, 1000)
}
function clearPagerDrag() {
  pagerDragArmed = false
  if (pagerDragTimer) { clearTimeout(pagerDragTimer); clearInterval(pagerDragTimer); pagerDragTimer = null }
}

// —— 整理 ——
const sorting = ref(false)
async function onSort() {
  sorting.value = true
  try {
    await backpackStore.sort(game.playerId)
    currentPage.value = 1
    bus.emit(BusEvents.TOAST, { type: 'info', message: '背包已整理' })
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '整理失败' })
  } finally {
    sorting.value = false
  }
}

// —— 双击使用物品（丹药/宝物等 usable 物品） ——
const usingItem = ref(false)   // 使用中防重复

/** 判断是否可使用（丹药/宝物 且 usable） */
function isUsable(data) {
  return data?.item && (data.item.type === '丹药' || data.item.type === '宝物') && data.item.usable
}

/** 双击格子：可使用物品 → 调 useItem → 刷新玩家状态 + 背包 */
async function onSlotDblClick(data) {
  if (!isUsable(data) || usingItem.value) return
  const pid = game.playerId
  if (!pid) return
  usingItem.value = true
  try {
    const res = await useItem(pid, data.item_id)
    // 刷新玩家状态（后端返回聚合数据含 final_attrs，用 load 重新拉取保证一致）
    await playerStore.load()
    // 刷新背包（物品数量变了）
    await backpackStore.reload(pid)
    bus.emit(BusEvents.TOAST, { type: 'success', message: `使用了 ${data.item?.name || data.item_id}` })
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '使用失败' })
  } finally {
    usingItem.value = false
  }
}
</script>

<template>
    <div class="dqdl-backpack">
        <div class="backpack-cells">
            <div
                v-for="ps in pageSlots"
                :key="ps.slot"
                class="backpack-cell"
                :class="{ 'has-item': ps.data, 'drag-over': draggingSlot === ps.slot }"
                draggable="true"
                v-tooltip="tipText(ps.data)"
                @dragstart="onDragStart($event, ps.slot)"
                @dragend="onDragEnd"
                @dragover="onDragOver"
                @drop="onDrop($event, ps.slot)"
                @dblclick="onSlotDblClick(ps.data)"
            >
                <template v-if="ps.data">
                    <img class="slot-icon" :src="iconUrl(ps.data.item)" :alt="ps.data.item?.name" @error="onIconError">
                    <span v-if="ps.data.count > 1" class="slot-count">{{ ps.data.count }}</span>
                </template>
            </div>
        </div>
        <div class="backpack-page-actions">
            <Pager
                :current="currentPage"
                :total="TOTAL_PAGES"
                @prev="prevPage"
                @next="nextPage"
                @prev-dragover="startPagerDrag('prev')" @prev-dragleave="clearPagerDrag" @prev-drop="clearPagerDrag"
                @next-dragover="startPagerDrag('next')" @next-dragleave="clearPagerDrag" @next-drop="clearPagerDrag"
            />
            <div class="backpack-actions">
                <LongButton @click="onSort">背包整理</LongButton>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.dqdl-backpack{
    width: 100%;
    padding: 10px 0;
    .backpack-cells{
        display: grid;
        grid-template-columns: repeat(16, 1fr);
        gap: 2px;
        .backpack-cell{
            width: 56px;
            height: 56px;
            background: url("/static/item-cell-bg.gif");
            background-size: 100% 100%;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            &.has-item{ cursor: grab; }
            &.has-item:active{ cursor: grabbing; }
            &.drag-over{ opacity: 0.5; }
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
        }
    }
    .backpack-page-actions{
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 10px;
    }
}
</style>
