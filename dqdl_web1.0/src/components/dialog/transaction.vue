<script setup>
/**
 * 交易弹窗（全局原子组件，App.vue 挂载，事件总线驱动显隐）。
 *
 * 触发：bus.on(TRANSACTION_OPEN) → 打开，由 NPC 对话「我想买卖些物品/丹药」(event=trade) 触发。
 * 左侧 NPC 商品 + 右侧玩家背包（4页：前3页110格，第4页6格）。
 * 显隐：内部 open ref + <Dlg v-if="open"> + Dlg @close 关闭。
 */
import Dlg from '@/components1/dlg.vue';
import Button from '@/components1/button.vue';
import Pager from '@/components1/pager.vue';
import { ref, computed, onMounted, onUnmounted } from 'vue'
import QuickButton from '@/components1/quickButton.vue';
import { useBackpackStore } from '@/stores/backpack';
import { useGameStore } from '@/stores/game';
import { bus, BusEvents } from '@/utils/eventBus';
import { getNpcShop, buyItem, sellItem } from '@/api';

const props = defineProps({
    commodityList: {
        type: Array,
        default: () => []
    }
})

const backpackStore = useBackpackStore()
const game = useGameStore()

const open = ref(false)
const npcId = ref(null)
const items = ref([])        // NPC 商品列表（getNpcShop 返回）
const loadingShop = ref(false)

// —— 右侧交易背包规格 ——
// 共 4 页：前 3 页每页 110 格（11×10），第 4 页 6 格，合计 336 格（与主背包一致）
const TOTAL_PAGES = 4
const SLOTS_PER_FULL_PAGE = 110   // 前3页每页110
const LAST_PAGE_COUNT = 6          // 第4页6格
const FALLBACK_ICON = '/icon/cl/cl-100.png'

const currentPage = ref(1)

/** 打开时刷新背包（拿到最新物品） */
async function refreshBackpack() {
    const pid = game.playerId
    if (pid) await backpackStore.reload(pid)
}

/** TRANSACTION_OPEN 触发打开：拉 NPC 商品 + 刷新背包 */
async function handleOpen({ npcId: id } = {}) {
    npcId.value = id
    open.value = true
    currentPage.value = 1
    items.value = []
    refreshBackpack()
    // 拉 NPC 商品（npc_shop 表按 role_id 关联，getNpcShop 内部转换）
    if (id) {
        loadingShop.value = true
        try {
            const res = await getNpcShop(id)
            items.value = res.items || []
        } catch (err) {
            bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载商品失败' })
            items.value = []
        } finally {
            loadingShop.value = false
        }
    }
}

/** 关闭 */
function onClose() {
    open.value = false
}

/** ESC 关闭 */
function onKeydown(e) {
    if (e.key === 'Escape' && open.value) onClose()
}

let offOpen = null
onMounted(() => {
    offOpen = bus.on(BusEvents.TRANSACTION_OPEN, handleOpen)
    window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
    offOpen && offOpen()
    window.removeEventListener('keydown', onKeydown)
})

/** 当前页格子数（1-3页110，第4页6） */
const slotsThisPage = computed(() =>
    currentPage.value < TOTAL_PAGES ? SLOTS_PER_FULL_PAGE : LAST_PAGE_COUNT,
)

/** slot→data 映射 */
const slotMap = computed(() => {
    const map = new Map()
    for (const s of backpackStore.slots) {
        if (s.slot) map.set(s.slot, s)
    }
    return map
})

/** 当前页的格子（带数据） */
const pageSlots = computed(() => {
    const start = (currentPage.value - 1) * SLOTS_PER_FULL_PAGE + 1
    const result = []
    for (let i = 0; i < slotsThisPage.value; i++) {
        const slotNum = start + i
        result.push({ slot: slotNum, data: slotMap.value.get(slotNum) || null })
    }
    return result
})

function prevPage() {
    if (currentPage.value > 1) currentPage.value--
}
function nextPage() {
    if (currentPage.value < TOTAL_PAGES) currentPage.value++
}

// —— 图标 / tooltip（复用 backpack 逻辑）——
/** 物品图标路径（按 item_id 前缀分发，覆盖背包物品+NPC商品所有类型） */
function iconUrl(item) {
    if (!item) return FALLBACK_ICON
    if (item.icon) return item.icon
    const id = item.item_id
    if (id?.startsWith('cl-')) return `/icon/cl/${id}.png`
    if (id?.startsWith('mh-')) return `/icon/mh/${id}.png`
    if (id?.startsWith('yb-')) return `/icon/alchemy/${id}.png`
    if (id?.startsWith('dp-')) return `/icon/pill/${id}.png`
    if (id?.startsWith('dj-') || id?.startsWith('gf-')) return `/icon/skill/${id}.png`
    if (id?.startsWith('bw-')) return `/icon/technique/${id}.png`
    return FALLBACK_ICON
}
function onIconError(e) {
    if (e.target.src !== FALLBACK_ICON) e.target.src = FALLBACK_ICON
}

const TYPE_LABEL = { '丹药': '丹药', '药材': '药材', '宝物': '宝物', '装备': '装备', '材料': '材料' }
function tipText(data) {
    if (!data?.item) return ''
    const it = data.item
    const lines = []
    lines.push(`<span style="font-size:14px;font-weight:bold;color:#f0c040;">${it.name || data.item_id}</span>`)
    if (it.type) lines.push(`<span style="color:#c8a0ff;">类型：${TYPE_LABEL[it.type] || it.type}</span>`)
    if (it.description) lines.push(`<div style="color:#d9d0c2;max-width:200px;word-break:break-all;line-height:1.5;">${it.description}</div>`)
    if (data.sell_price != null) lines.push(`<span style="color:#50c878;">出售 ${data.sell_price} 金</span>`)
    lines.push(`<span style="color:#80c8ff;">右键出售</span>`)
    return lines.join('<br/>')
}

// —— 购买逻辑（参照 NpcShopPanel：点击=买1个，Shift+点击=弹批量框）——
const buying = ref(false)
const buyModal = ref(null)   // { item_id, name, price } 弹窗状态，null=关闭
const buyCount = ref(1)

/** 购买入口：直接点击=买1个，Shift+点击=弹数量输入框 */
function handleBuy(item, e) {
    const shift = e && (e.shiftKey || e.metaKey)
    if (buying.value) return
    if (shift) {
        buyModal.value = { item_id: item.item_id, name: item.name, price: item.price }
        buyCount.value = 1
    } else {
        doBuy(item, 1)
    }
}

/** 执行购买（调后端 buy，单事务扣钱+加背包），返回 money 同步 store + 刷新背包 */
async function doBuy(item, count) {
    const pid = game.playerId
    if (buying.value || !pid) return
    buying.value = true
    try {
        const res = await buyItem(pid, item.item_id, count)
        backpackStore.setMoney(res.money)
        await backpackStore.reload(pid)
        bus.emit(BusEvents.TOAST, { type: 'success', message: `购买了 ${count} 个 ${item.name}` })
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '购买失败' })
    } finally {
        buying.value = false
        buyModal.value = null
    }
}

/** 确认弹窗购买（按当前输入数量） */
function confirmBuy() {
    if (!buyModal.value) return
    const c = Math.max(1, Math.floor(Number(buyCount.value) || 0))
    doBuy({ item_id: buyModal.value.item_id, name: buyModal.value.name }, c)
}

/** 弹窗：填入当前金币可购买的最大数量 */
function setBuyMax() {
    if (!buyModal.value) return
    const price = buyModal.value.price || 0
    const max = price > 0 ? Math.floor(backpackStore.money / price) : 1
    buyCount.value = Math.max(1, max)
}

// —— 出售逻辑（右键背包格子：数量1直接卖，数量>1弹批量框）——
const selling = ref(false)
const sellModal = ref(null)   // { item_id, name, sell_price, count } null=关闭
const sellCount = ref(1)

/** 右键格子：数量=1直接出售1个，数量>1弹数量输入框 */
function handleSellClick(data, e) {
    if (!data?.data || selling.value) return
    const slot = data.data
    const count = slot.count || 1
    if (count <= 1) {
        doSell(slot, 1)
    } else {
        sellModal.value = {
            item_id: slot.item_id,
            name: slot.item?.name || slot.item_id,
            sell_price: slot.sell_price ?? 0,
            count,
        }
        sellCount.value = 1
    }
}

/** 执行出售（调后端 sell，单事务加钱+扣背包），返回 money 同步 store + 刷新背包 */
async function doSell(slot, count) {
    const pid = game.playerId
    if (selling.value || !pid) return
    selling.value = true
    try {
        const res = await sellItem(pid, slot.item_id, count)
        backpackStore.setMoney(res.money)
        await backpackStore.reload(pid)
        bus.emit(BusEvents.TOAST, { type: 'success', message: `出售了 ${count} 个 ${slot.item?.name || slot.item_id}` })
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '出售失败' })
    } finally {
        selling.value = false
        sellModal.value = null
    }
}

/** 确认弹窗出售（按当前输入数量，校验不超过持有量） */
function confirmSell() {
    if (!sellModal.value || selling.value) return
    const c = Math.max(1, Math.min(sellModal.value.count, Math.floor(Number(sellCount.value) || 0)))
    doSell({ item_id: sellModal.value.item_id, item: { name: sellModal.value.name } }, c)
}

/** 弹窗：填入持有最大数量 */
function setSellMax() {
    if (!sellModal.value) return
    sellCount.value = Math.max(1, sellModal.value.count)
}
</script>


<template>
    <Dlg
        v-if="open"
        title="交易"
        :contentStyleProp="{ width: '1000px', height: '500px' }"
        @close="onClose">
        <div class="dqdl-transaction">
            <div class="transaction-left">
                <div class="commodity-list">
                    <div v-if="loadingShop" class="commodity-empty">正在摆出商品...</div>
                    <div v-else-if="!items.length" class="commodity-empty">该店铺暂无商品</div>
                    <div
                        v-else
                        class="commodity-item"
                        v-for="item in items"
                        :key="item.item_id"
                    >
                        <img class="commodity-icon" :src="iconUrl(item)" :alt="item.name" @error="onIconError">
                        <div class="commodity-name-price-btn">
                            <div class="commodity-name">{{ item.name }}</div>
                            <div class="commodity-price">{{ item.price }}金币</div>
                            <QuickButton class="commodity-btn" style="width: 50px;" @click="handleBuy(item, $event)">购买</QuickButton>
                        </div>
                    </div>
                </div>
            </div>
            <div class="transaction-right">
                <div class="transaction-backpack-grid">
                    <div
                        v-for="ps in pageSlots"
                        :key="ps.slot"
                        class="backback-cell"
                        :class="{ 'has-item': ps.data }"
                        v-tooltip="tipText(ps.data)"
                        @contextmenu.prevent="handleSellClick(ps, $event)"
                    >
                        <template v-if="ps.data">
                            <img class="slot-icon" :src="iconUrl(ps.data.item)" :alt="ps.data.item?.name" @error="onIconError">
                            <span v-if="ps.data.count > 1" class="slot-count">{{ ps.data.count }}</span>
                        </template>
                    </div>
                </div>
                <div class="backpack-bottom">
                    <Pager
                        :current="currentPage"
                        :total="TOTAL_PAGES"
                        @prev="prevPage"
                        @next="nextPage"
                    ></Pager>
                </div>
            </div>
        </div>
    </Dlg>

    <!-- 购买数量弹窗（Shift+点击购买时弹出） -->
    <!-- 购买数量弹窗（Shift+点击购买时弹出，用 Dlg 组件） -->
    <Dlg
        v-if="buyModal"
        :title="'购买 · ' + buyModal.name"
        @close="buyModal = null"
    >
        <div class="buy-content">
            <div class="buy-hint">单价 {{ buyModal.price }} 金 · 金币 {{ backpackStore.money }}</div>
            <div class="buy-input-row">
                <span>请输入购买数量：</span>
                <input
                    v-model.number="buyCount"
                    type="number"
                    :min="1"
                    class="buy-input"
                    @keyup.enter="confirmBuy"
                >
                <div class="buy-max-btn" @click="setBuyMax">最大</div>
            </div>
            <div class="buy-total">合计 {{ (buyModal.price || 0) * Math.max(0, buyCount || 0) }} 金</div>
            <div class="buy-actions">
                <Button class="buy-cancel" @click="buyModal = null">取消</Button>
                <Button class="buy-confirm" @click="!buying && confirmBuy">
                    确定
                </Button>
            </div>
        </div>
    </Dlg>

    <!-- 出售数量弹窗（右键数量>1的物品时弹出） -->
    <Dlg
        v-if="sellModal"
        :title="'出售 · ' + sellModal.name"
        @close="sellModal = null"
    >
        <div class="buy-content">
            <div class="buy-hint">售价 {{ sellModal.sell_price }} 金/个 · 持有 {{ sellModal.count }} 个</div>
            <div class="buy-input-row">
                <span>请输入出售数量：</span>
                <input
                    v-model.number="sellCount"
                    type="number"
                    :min="1"
                    :max="sellModal.count"
                    class="buy-input"
                    @keyup.enter="confirmSell"
                >
                <div class="buy-max-btn" @click="setSellMax">最大</div>
            </div>
            <div class="buy-total">合计 {{ (sellModal.sell_price || 0) * Math.max(0, sellCount || 0) }} 金</div>
            <div class="buy-actions">
                <Button class="buy-cancel" @click="sellModal = null">取消</Button>
                <Button class="buy-confirm" @click="confirmSell">
                    确定
                </Button>
            </div>
        </div>
    </Dlg>
</template>

<style lang="less" scoped>
.dqdl-transaction{
    display: flex;
    gap: 8px;
    height: 100%;
    .transaction-left{
        background: #ece9e1;
        border-radius: 5px;
        flex: 1;
        padding: 8px;
        overflow-y: auto;
        .commodity-empty{
            grid-column: 1 / -1;
            text-align: center;
            color: #8a7a60;
            padding: 40px 0;
        }
        .commodity-list{
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            grid-auto-rows: min-content;
            align-content: start;
            gap: 10px;
            min-height: 100%;
            .commodity-item{
                background-color: #dfd9d2;
                border: 1px solid #bbb09a;
                border-radius: 5px;
                display: flex;
                gap: 10px;
                padding: 10px;
                .commodity-icon{
                    display: block;
                    width: 60px;
                    height: 60px;
                }
                .commodity-name-price-btn{
                    position: relative;
                    flex: 1;
                    text-align: left;
                    .commodity-name{
                        font-size: 14px;
                    }
                    .commodity-price{
                        color: #c80000;
                    }
                    .commodity-btn{
                        position: absolute;
                        bottom: 0;
                        right: 0;
                    }
                }
            }
        }
    }
    .transaction-right{
        background: #ece9e1;
        padding: 5px;
        display: flex;
        flex-direction: column;
        .transaction-backpack-grid{
            display: grid;
            grid-template-columns: repeat(11, 38px);
            grid-auto-rows: 38px;
            gap: 5px;
            .backback-cell{
                width: 38px;
                height: 38px;
                background: url("/static/item-cell-bg.gif");
                background-size: 100% 100%;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                &.has-item{ cursor: default; }
                .slot-icon{
                    width: 90%;
                    height: 90%;
                    object-fit: contain;
                    pointer-events: none;
                }
                .slot-count{
                    position: absolute;
                    bottom: 0;
                    right: 2px;
                    font-size: 11px;
                    color: #fff;
                    text-shadow: 1px 1px 2px #000;
                    pointer-events: none;
                }
            }
        }
        .backpack-bottom{
            margin-top: 8px;
            display: flex;
            justify-content: center;
        }
    }
}
</style>

<!-- 购买数量弹窗样式（Dlg 内容，scoped 生效） -->
<style lang="less" scoped>
.buy-content{
    text-align: left;
    color: #3a2a1a;
    .buy-hint{
        margin-top: 6px;
        font-size: 13px;
        color: #8a7a60;
    }
    .buy-input-row{
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 8px;
        margin-top: 14px;
        .buy-max-btn{
            cursor: pointer;
            text-decoration: underline;
        }
        .buy-input{
            padding: 6px 8px;
            border-radius: 4px;
            border: 1px solid #bbb09a;
            background: #fff;
            color: #3a2a1a;
            outline: none;
            width: 100px;
        }
    }
    .buy-total{
        margin-top: 10px;
        font-size: 14px;
        color: #c80000;
        text-align: right;
    }
    .buy-actions{
        display: flex;
        gap: 10px;
        margin-top: 16px;
        justify-content: center;
        /* 穿透 Button 组件（.dqdl-button）覆盖样式 */
        :deep(.dqdl-button){
            flex: 0 0 102px;       /* Button 自带 102px 宽，不被 flex 拉伸 */
        }
    }
}
</style>