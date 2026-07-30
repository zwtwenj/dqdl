<script setup>
/**
 * 背包组件：16×7=112 格/页 × 3 页 = 336 格。
 * 支持分页切换、物品拖拽交换、整理排序。
 * 数据来源：backpackStore（内存常驻）。
 */
import { ref, computed, onMounted } from 'vue'
import { useBackpackStore } from '@/stores/backpack'
import { useGameStore } from '@/stores/game'
import { bus, BusEvents } from '@/utils/eventBus'
import LongButton from '@/components1/longButton.vue'

const backpackStore = useBackpackStore()
const game = useGameStore()

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
  if (it.description) lines.push(`<span style="color:#d9d0c2;">${it.description}</span>`)
  if (data.sell_price != null) lines.push(`<span style="color:#50c878;">出售 ${data.sell_price} 金</span>`)
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
            >
                <template v-if="ps.data">
                    <img class="slot-icon" :src="iconUrl(ps.data.item)" :alt="ps.data.item?.name" @error="onIconError">
                    <span v-if="ps.data.count > 1" class="slot-count">{{ ps.data.count }}</span>
                </template>
            </div>
        </div>
        <div class="backpack-page-actions">
            <div class="backpack-page">
                <div class="backpack-page-left" @click="prevPage"
                    @dragover.prevent="startPagerDrag('prev')" @dragleave="clearPagerDrag" @drop.prevent="clearPagerDrag"></div>
                <div class="backpack-page-textarea">
                    <div class="textarea-left"></div>
                    <div class="textarea-body">{{ currentPage }} / {{ TOTAL_PAGES }}</div>
                    <div class="textarea-right"></div>
                </div>
                <div class="backpack-page-right" @click="nextPage"
                    @dragover.prevent="startPagerDrag('next')" @dragleave="clearPagerDrag" @drop.prevent="clearPagerDrag"></div>
            </div>
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
        .backpack-page{
            display: flex;
            align-items: center;
            gap: 3px;
            margin-top: 10px;
            .backpack-page-left, .backpack-page-right{
                cursor: pointer;
                width: 15px;
                height: 16px;
            }
            .backpack-page-left{ background: url("/static/arrow-left.gif"); }
            .backpack-page-right{ background: url("/static/arrow-right.gif"); }
            .backpack-page-textarea{
                display: flex;
                .textarea-left{
                    float: left;
                    width: 3px;
                    height: 22px;
                    background: url("/static/textarea-left.gif") no-repeat;
                }
                .textarea-right{
                    float: right;
                    width: 3px;
                    height: 22px;
                    background: url("/static/textarea-right.gif") no-repeat;
                }
                .textarea-body{
                    float: left;
                    line-height: 22px;
                    text-align: center;
                    color: #e9e5dc;
                    padding: 0 5px;
                    height: 22px;
                    background: transparent url("/static/textarea-bg.gif") repeat-x;
                }
            }
        }
    }
}
</style>
