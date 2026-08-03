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
import { getEncounters } from '@/api'

// 奇遇列表上限（与后端 ENCOUNTER.maxPending 一致，后续可改后端动态返回）
const MAX_PENDING = 10

const open = ref(false)
const loading = ref(false)
const list = ref([])

/** 打开：拉取列表 */
async function handleOpen() {
    open.value = true
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

/** 点击卡片 → 弹独立详情 Dlg（秘境/洞天福地分开） */
function onCardClick(enc) {
    if (enc.kind === 'cultivate') {
        bus.emit(BusEvents.CULTIVATION_DETAIL_OPEN, { encounterId: enc.id })
        return
    }
    // 秘境
    bus.emit(BusEvents.DUNGEON_DETAIL_OPEN, { encounterId: enc.id })
}

let offOpen = null
let offCultStart = null
let offCultFinished = null
onMounted(() => {
    offOpen = bus.on(BusEvents.ADVENTURE_OPEN, handleOpen)
    // 修炼开始/结束 → 刷新列表（entered 状态变化反映到"修炼中"标记）
    offCultStart = bus.on(BusEvents.CULTIVATION_START, () => loadList())
    offCultFinished = bus.on(BusEvents.CULTIVATION_FINISHED, () => loadList())
})
onUnmounted(() => {
    offOpen && offOpen()
    offCultStart && offCultStart()
    offCultFinished && offCultFinished()
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
                            <!-- 洞天福地修炼中：entered 状态 + cultivate 类型 -->
                            <span
                                v-if="enc.kind === 'cultivate' && enc.status === 'entered'"
                                class="adv-cultivating"
                            >修炼中</span>
                        </div>
                        <span class="adv-kind">{{ kindLabel(enc) }}</span>
                    </div>
                    <div class="adv-desc">{{ enc.description }}</div>
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
    /* 洞天福地修炼中标记 */
    .adv-cultivating{
        display: inline-block;
        padding: 1px 8px;
        font-size: 11px;
        color: #7fa860;
        border: 1px solid #9cc07a;
        border-radius: 3px;
        background: #f0f7e8;
        margin-left: 5px;
    }
}
</style>
