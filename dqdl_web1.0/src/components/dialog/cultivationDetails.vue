<script setup>
/**
 * 洞天福地详情 + 修炼面板（Dlg 弹框形式，App.vue 全局挂载，事件总线驱动显隐）。
 *
 * 触发：bus.on(CULTIVATION_DETAIL_OPEN, { encounterId })。
 * 用 encounterId 调 getEncounter 拉详情（含 cultivation 修炼数据，join cultivation_session）。
 * 详情态：显示洞天福地信息（名称/星级/描述）+ 修炼按钮。
 * 点击修炼 → 调 enterCultivation(blessed) → 切实时态 + 刷新玩家状态。
 * 实时态：监听 CULTIVATION_SETTLE 更新修为/轮数，CULTIVATION_FINISHED 显示结束。
 *   若 encounter 已有进行中的 cultivation（重连场景），直接进实时态。
 *
 * 组件结构参考旧版 CultivationPanel 的 blessed live 分支。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import Star from '@/components1/star.vue'
import Button from '@/components1/button.vue'
import { bus, BusEvents } from '@/utils/eventBus'
import { enterCultivation, getEncounter } from '@/api'
import { usePlayerStore } from '@/stores/player'

const playerStore = usePlayerStore()

/** 'detail' 详情态 / 'live' 实时修炼态 */
const view = ref('detail')
const open = ref(false)
const encounterId = ref(null)
const info = ref(null)       // getEncounter 返回的完整奇遇详情
const entering = ref(false)

// 实时态数据（来自 cultivation_settle SSE）
const live = ref({
    rounds: 0,
    total_gained: 0,
    max_rounds: 10,
    gained: 0,
    critical: false,
})
const finishedReason = ref('')

const REASON_TEXT = {
    full: '修为已满',
    rounds: '吐纳圆满',
    timeout: '修炼时辰已到',
    insufficient: '金币不足',
    stopped: '已停止修炼',
}

const finishedText = computed(() => REASON_TEXT[finishedReason.value] || '')

/** 打开：用 encounterId 拉详情（含修炼数据），有进行中的修炼则进实时态 */
async function handleOpen({ encounterId: eid } = {}) {
    if (!eid) return
    encounterId.value = eid
    finishedReason.value = ''
    live.value = { rounds: 0, total_gained: 0, max_rounds: 10, gained: 0, critical: false }
    open.value = true
    try {
        const data = await getEncounter(eid)
        info.value = data
        // 已有进行中的修炼（entered + cultivation.status=active）→ 直接进实时态
        if (data?.cultivation && data.cultivation.status === 'active') {
            live.value = {
                rounds: data.cultivation.rounds ?? 0,
                total_gained: data.cultivation.total_gained ?? 0,
                max_rounds: data.cultivation.max_rounds ?? 10,
                gained: 0,
                critical: false,
            }
            view.value = 'live'
        } else {
            view.value = 'detail'
        }
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载详情失败' })
        open.value = false
    }
}

/** 点击修炼 → 调 enter 进入修炼 → 切实时态 + 刷新玩家状态（status→修炼中） */
async function onCultivate() {
    if (entering.value || !encounterId.value) return
    entering.value = true
    try {
        const session = await enterCultivation({
            scene: 'blessed',
            encounterId: encounterId.value,
        })
        live.value = {
            rounds: session.rounds ?? 0,
            total_gained: session.total_gained ?? 0,
            max_rounds: session.max_rounds ?? 10,
            gained: 0,
            critical: false,
        }
        view.value = 'live'
        // 修炼开始 → 刷新玩家信息（状态变修炼中，状态栏同步）
        playerStore.load()
        bus.emit(BusEvents.TOAST, { type: 'success', message: '开始修炼' })
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '进入修炼失败' })
    } finally {
        entering.value = false
    }
}

/** SSE 结算推送 → 更新实时数据 + 刷新玩家修为 */
function onSettle(data) {
    if (view.value !== 'live' || !data) return
    live.value = { ...live.value, ...data }
    // 修炼改了玩家修为，刷新玩家状态（状态栏修为同步）
    playerStore.load()
}

/** SSE 修炼结束 → 显示结束原因 + 刷新玩家状态（status 回 IDLE） */
function onFinished({ reason } = {}) {
    finishedReason.value = reason || ''
    playerStore.load()
}

/** 关闭 */
function onClose() {
    open.value = false
    view.value = 'detail'
    encounterId.value = null
    info.value = null
    live.value = { rounds: 0, total_gained: 0, max_rounds: 10, gained: 0, critical: false }
    finishedReason.value = ''
}

let offOpen = null
let offSettle = null
let offFinished = null
onMounted(() => {
    offOpen = bus.on(BusEvents.CULTIVATION_DETAIL_OPEN, handleOpen)
    offSettle = bus.on(BusEvents.CULTIVATION_SETTLE, onSettle)
    offFinished = bus.on(BusEvents.CULTIVATION_FINISHED, onFinished)
})
onUnmounted(() => {
    offOpen && offOpen()
    offSettle && offSettle()
    offFinished && offFinished()
})
</script>

<template>
    <Dlg
        v-if="open"
        title="洞天福地"
        :contentStyleProp="{ width: '500px' }"
        @close="onClose"
    >
        <div class="cult-detail-content">
            <!-- ===== 详情态 ===== -->
            <template v-if="view === 'detail'">
                <div class="cult-top">
                    <div class="cult-title">{{ info?.title || '洞天福地' }}</div>
                    <Star v-if="info?.star" :star="info.star" />
                </div>
                <div class="cult-desc">{{ info?.description }}</div>
                <div class="cult-actions">
                    <Button class="cult-btn" @click="onCultivate">修炼</Button>
                </div>
            </template>

            <!-- ===== 实时修炼态 ===== -->
            <template v-else>
                <div class="cv-scene">{{ info?.title || '洞天福地' }}</div>
                <div class="cv-status">
                    <span v-if="!finishedText">潜心修炼中...</span>
                    <span v-else class="cv-finished">{{ finishedText }}</span>
                </div>
                <div class="cv-round">第 {{ live.rounds }} / {{ live.max_rounds }} 轮</div>

                <!-- 大数字：总修为 -->
                <div class="cv-big">
                    <div class="cv-big-label">获得修为</div>
                    <div class="cv-big-val">+{{ live.total_gained }}</div>
                </div>
                <div v-if="live.critical" class="cv-crit">⚡ 暴击！</div>

                <!-- 两小格 -->
                <div class="cv-stats">
                    <div class="cv-stat">
                        <em>{{ live.rounds }}</em>
                        <span>吐纳次数</span>
                    </div>
                    <div class="cv-stat">
                        <em>洞天</em>
                        <span>免费修炼</span>
                    </div>
                </div>
            </template>
        </div>
    </Dlg>
</template>

<style lang="less" scoped>
.cult-detail-content{
    text-align: left;
    padding: 8px 12px;
    background: #efede9;
}
.cult-top{
    display: flex;
    justify-content: space-between;
    align-items: center;
    .cult-title{
        font-size: 16px;
        font-weight: bold;
        color: #3a2a1a;
    }
}
.cult-desc{
    font-size: 13px;
    color: #6a5a48;
    line-height: 1.7;
    margin: 10px 0;
}
.cult-actions{
    margin-top: 16px;
    text-align: center;
}
/* 实时修炼态 */
.cv-scene{
    font-size: 15px;
    font-weight: bold;
    color: #3a2a1a;
    text-align: center;
}
.cv-status{
    text-align: center;
    margin: 8px 0 4px;
    .cv-finished{
        color: #b8860b;
        font-weight: bold;
    }
}
.cv-round{
    text-align: center;
    font-size: 13px;
    color: #8a7a60;
    margin-bottom: 12px;
}
.cv-big{
    text-align: center;
    margin: 10px 0;
    .cv-big-label{
        font-size: 13px;
        color: #8a7a60;
    }
    .cv-big-val{
        font-size: 28px;
        font-weight: bold;
        color: #b8860b;
    }
}
.cv-crit{
    text-align: center;
    color: #c80000;
    font-weight: bold;
    font-size: 13px;
}
.cv-stats{
    display: flex;
    justify-content: center;
    gap: 30px;
    margin-top: 14px;
    .cv-stat{
        text-align: center;
        em{
            display: block;
            font-style: normal;
            font-size: 18px;
            font-weight: bold;
            color: #3a2a1a;
        }
        span{
            font-size: 12px;
            color: #8a7a60;
        }
    }
}
</style>
