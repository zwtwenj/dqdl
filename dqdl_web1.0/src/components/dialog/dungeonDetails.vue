<script setup>
/**
 * 秘境详情弹窗（Dlg 弹框形式，App.vue 全局挂载，事件总线驱动显隐）。
 *
 * 触发：bus.on(DUNGEON_DETAIL_OPEN, { encounterId })。
 * 用 encounterId 调 getEncounter 拉秘境详情（解耦：外部只传 id，本组件自行查）。
 * 显示秘境信息（标题/描述/类型/星级）+ 进入/放弃按钮。
 * 进入：pending→带 encounterId 生成新秘境；entered→恢复进行中秘境。
 * 放弃：调 abandonEncounter 移除（仅 pending 可放弃）。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import Star from '@/components1/star.vue'
import Button from '@/components1/button.vue'
import { bus, BusEvents } from '@/utils/eventBus'
import { getEncounter, abandonEncounter } from '@/api'

const open = ref(false)
const encounterId = ref(null)
const info = ref(null)       // getEncounter 返回的秘境详情
const abandoning = ref(false)

async function handleOpen({ encounterId: eid } = {}) {
    if (!eid) return
    encounterId.value = eid
    open.value = true
    try {
        info.value = await getEncounter(eid)
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载秘境详情失败' })
        open.value = false
    }
}

/** 进入秘境：带 encounterId（dungeonPanel 优先按 encounter 还原，无则生成新秘境） */
function onEnter() {
    if (!info.value?.id) return
    bus.emit(BusEvents.DUNGEON_OPEN, { encounterId: info.value.id })
    open.value = false
}

/** 放弃秘境（仅 pending） */
async function onAbandon() {
    if (!info.value || abandoning.value) return
    abandoning.value = true
    try {
        await abandonEncounter(info.value.id)
        bus.emit(BusEvents.TOAST, { type: 'info', message: '已放弃该秘境' })
        open.value = false
    } catch (e) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: e.message || '放弃失败' })
    } finally {
        abandoning.value = false
    }
}

function onClose() {
    open.value = false
    encounterId.value = null
    info.value = null
}

let offOpen = null
onMounted(() => {
    offOpen = bus.on(BusEvents.DUNGEON_DETAIL_OPEN, handleOpen)
})
onUnmounted(() => {
    offOpen && offOpen()
})
</script>

<template>
    <Dlg
        v-if="open"
        title="秘境"
        :contentStyleProp="{ width: '500px' }"
        @close="onClose"
    >
        <div class="dungeon-detail-content">
            <div class="dun-top">
                <div class="dun-title">{{ info?.title || '秘境' }}</div>
                <span class="dun-kind">秘境入口</span>
                <Star v-if="info?.star" :star="info.star" />
            </div>
            <div class="dun-desc">{{ info?.description }}</div>
            <div class="dun-actions">
                <Button class="dun-btn enter" @click="onEnter">进入</Button>
                <Button
                    v-if="info?.status === 'pending'"
                    class="dun-btn abandon"
                    @click="onAbandon"
                >放弃</Button>
            </div>
        </div>
    </Dlg>
</template>

<style lang="less" scoped>
.dungeon-detail-content{
    text-align: left;
    padding: 6px;
}
.dun-top{
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: linear-gradient(180deg, #f6f4ef, #ece8e0);
    border: 1px solid #bbb09a;
    border-radius: 6px;
    .dun-title{
        font-size: 16px;
        font-weight: bold;
        color: #3a2a1a;
        letter-spacing: 2px;
    }
    .dun-kind{
        font-size: 12px;
        color: #8a7a60;
    }
}
.dun-desc{
    font-size: 13px;
    color: #5a4a38;
    line-height: 1.8;
    margin: 10px 0;
    padding: 10px 12px;
    background: #fbf9f4;
    border: 1px solid #d8cdb8;
    border-radius: 6px;
    position: relative;
    &::before{
        content: '';
        position: absolute;
        left: 0;
        top: 6px;
        bottom: 6px;
        width: 3px;
        background: #c8a44a;
        border-radius: 2px;
    }
}
.dun-actions{
    margin-top: 14px;
    display: flex;
    justify-content: center;
    gap: 12px;
    :deep(.dqdl-button){
        width: 110px;
    }
    .dun-btn.abandon{
 
    }
}
</style>
