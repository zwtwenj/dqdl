<script setup>
/**
 * 奇遇列表弹窗（Dlg 弹框形式，App.vue 全局挂载，事件总线驱动显隐）。
 *
 * 触发：bus.on(ADVENTURE_OPEN) → 拉取玩家 pending/entered 奇遇列表。
 * 列表卡片点击展开详情（Dlg 内子弹层）：
 *   「进入」dungeon→秘境面板（pending带encounterId生成/entered恢复），cultivate→洞天福地修炼面板
 *   「放弃」调后端移除该奇遇（仅 pending）
 *
 * 移植自 AdventureListPanel，改为 Dlg 形式（样式后续手改）。
 * 显隐：内部 open ref + <Dlg v-if="open"> + Dlg @close 关闭。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import Star from '@/components1/star.vue'
import { bus, BusEvents } from '@/utils/eventBus'
import { getEncounters, abandonEncounter } from '@/api'

// 奇遇列表上限（与后端 ENCOUNTER.maxPending 一致，后续可改后端动态返回）
const MAX_PENDING = 10

const open = ref(false)
const loading = ref(false)
const list = ref([])
const selected = ref(null) // 详情子弹层当前奇遇
const abandoning = ref(false)

/** 打开：拉取列表 */
async function handleOpen() {
    open.value = true
    selected.value = null
    await loadList()
}

async function loadList() {
    loading.value = true
    try {
        list.value = await getEncounters()
    } catch (e) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: e.message || '奇遇列表加载失败' })
    } finally {
        loading.value = false
    }
}

/** 类型徽章文案 */
function kindLabel(enc) {
    return enc.kind === 'cultivate' ? '洞天福地' : '秘境入口'
}

/** 点击卡片 → 打开详情 */
function onCardClick(enc) {
    // 洞天福地：直接弹详情 Dlg（不在列表内展开子弹层）
    if (enc.kind === 'cultivate') {
        bus.emit(BusEvents.CULTIVATION_DETAIL_OPEN, { encounterId: enc.id })
        return
    }
    // 其他类型（秘境）：展开列表内详情子弹层
    selected.value = enc
}

/** 放弃奇遇 */
async function onAbandon() {
    if (!selected.value || abandoning.value) return
    abandoning.value = true
    try {
        list.value = await abandonEncounter(selected.value.id)
        selected.value = null
        bus.emit(BusEvents.TOAST, { type: 'info', message: '已放弃该奇遇' })
    } catch (e) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: e.message || '放弃失败' })
    } finally {
        abandoning.value = false
    }
}

/**
 * 进入奇遇：
 * - dungeon：pending→带 encounterId 生成新秘境；entered→恢复进行中秘境
 * - cultivate：带 encounterId 触发洞天福地修炼面板
 */
function onEnter() {
    if (!selected.value) return
    if (selected.value.kind === 'dungeon') {
        const payload = selected.value.status === 'entered'
            ? {}
            : { encounterId: selected.value.id }
        bus.emit(BusEvents.DUNGEON_OPEN, payload)
        selected.value = null
        open.value = false
        return
    }
    if (selected.value.kind === 'cultivate') {
        bus.emit(BusEvents.CULTIVATION_DETAIL_OPEN, {
            encounterId: selected.value.id,
            title: selected.value.title,
            star: selected.value.star,
            description: selected.value.description,
        })
        selected.value = null
        open.value = false
        return
    }
}

let offOpen = null
onMounted(() => {
    offOpen = bus.on(BusEvents.ADVENTURE_OPEN, handleOpen)
})
onUnmounted(() => {
    offOpen && offOpen()
})
</script>

<template>
    <Dlg
        v-if="open"
        title="奇遇"
        :contentStyleProp="{ width: '600px', height: '600px' }"
        @close="open = false"
    >
        <div class="adventure-content">
            <!-- 列表 -->
            <div v-if="loading" class="adv-empty">加载中...</div>
            <div v-else-if="!list.length" class="adv-empty">暂无奇遇</div>
            <div v-else class="adv-list">
                <div class="adv-count">
                    当前触发奇遇：<span class="adv-count-num">{{ list.length }} / {{ MAX_PENDING }}</span>
                </div>
                <div
                    v-for="enc in list"
                    :key="enc.id"
                    class="adv-card"
                    :class="{ entered: enc.status === 'entered' }"
                    @click="onCardClick(enc)"
                >
                    <div class="adv-card-top">
                        <div class="adv-title-star">
                            <span class="adv-title">{{ enc.title }}</span>
                            <Star v-if="enc.star" :star="enc.star" />
                        </div>
                        <span class="adv-kind">{{ kindLabel(enc) }}</span>
                    </div>
                    

                    <div class="adv-desc">{{ enc.description }}</div>
                </div>
            </div>

            <!-- 详情子弹层（点击卡片后显示） -->
            <div v-if="selected" class="adv-detail">
                <div class="adv-detail-title">{{ selected.title }}</div>
                <div class="adv-detail-kind">{{ kindLabel(selected) }}</div>
                <Star v-if="selected.star" :star="selected.star" />

                <div class="adv-detail-desc">{{ selected.description }}</div>
                <div class="adv-detail-actions">
                    <button class="adv-btn enter" @click="onEnter">进入</button>
                    <button
                        v-if="selected.status === 'pending'"
                        class="adv-btn abandon"
                        :disabled="abandoning"
                        @click="onAbandon"
                    >放弃</button>
                </div>
            </div>
        </div>
    </Dlg>
</template>

<style lang="less" scoped>
.adventure-content{
    text-align: left;
    position: relative;
    height: 100%;
    overflow-y: auto;
}
.adv-empty{
    text-align: center;
    color: #8a7a60;
    padding: 40px 0;
}
.adv-list{
    display: flex;
    flex-direction: column;
    gap: 8px;
    .adv-count{
        text-align: right;
        padding-right: 10px;
        .adv-count-num{
            color: #c80000;
        }
    }
}
.adv-card{
    padding: 8px 10px;
    background: #f6f4ef;
    border: 1px solid #bbb09a;
    border-radius: 4px;
    cursor: pointer;
    &:hover{
        background: #efeadf;
    }
    &.entered{
        border-color: #c8a44a;
        background: #fbf6e8;
    }
    .adv-card-top{
        display: flex;
        align-items: center;
        justify-content: space-between;
        .adv-title-star{
            display: flex;
            align-items: center;
        }
        .adv-title{
            font-size: 14px;
            font-weight: bold;
            color: #3a2a1a;
            margin-right: 5px;
        }
        .adv-kind{
            font-size: 12px;
            color: #8a7a60;
        }
    }
    .adv-desc{
        font-size: 12px;
        color: #6a5a48;
        margin-top: 4px;
        line-height: 1.5;
    }
}
/* 详情子弹层 */
.adv-detail{
    margin-top: 12px;
    padding: 10px;
    border: 1px solid #bbb09a;
    background: #efede9;
    border-radius: 4px;
    .adv-detail-title{
        font-size: 15px;
        font-weight: bold;
        color: #3a2a1a;
    }
    .adv-detail-kind{
        font-size: 12px;
        color: #8a7a60;
    }
    .adv-detail-desc{
        font-size: 13px;
        color: #4a3a28;
        line-height: 1.6;
        margin-top: 6px;
    }
    .adv-detail-actions{
        display: flex;
        gap: 8px;
        margin-top: 12px;
        justify-content: center;
    }
}
.adv-btn{
    padding: 5px 18px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    border: 1px solid;
    &.enter{
        color: #fff;
        background: #b8860b;
        border-color: #d4af6a;
    }
    &.abandon{
        color: #d8a8a0;
        background: #fff;
        border-color: #c8a090;
        &:disabled{ opacity: 0.5; cursor: not-allowed; }
    }
}
</style>
