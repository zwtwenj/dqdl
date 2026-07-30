<script setup>
/**
 * 任务列表弹窗（Dlg 弹框形式，index.vue 挂载，事件总线驱动显隐）。
 *
 * 触发：bus.on(TASK_LIST_OPEN, { playerId }) → 打开 + getMyTasks 拉列表。
 * 顶部用 Dlg 的 tabs prop 渲染"当前任务"标签栏（替代 title）。
 * 列表按设计稿：文字流一行式——任务名(加粗) → → → target描述(带高亮span, v-html) → 进度(current/required)，
 * 右上角"查看详情"点击 → emit TASK_DETAILS_OPEN 打开 taskDetails 查看模式。
 * 刷新：监听 TASK_CLAIM_UPDATE（交付后）自动重新拉取。
 *
 * 显隐：内部 open ref + <Dlg v-if="open"> + Dlg @close 关闭。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import { usePlayerStore } from '@/stores/player'
import { bus, BusEvents } from '@/utils/eventBus'
import { getMyTasks } from '@/api/task'
import Star from '@/components1/star.vue'

const playerStore = usePlayerStore()
const open = ref(false)
const tasks = ref([])
const loading = ref(false)

// Dlg 的 tabs 配置：当前任务（单标签）
const tabs = [{ text: '当前任务', value: 'current' }]

/** 拉取进行中任务 */
async function loadTasks() {
    const pid = playerStore.player?.id
    if (!pid) return
    loading.value = true
    try {
        const list = await getMyTasks(pid)
        tasks.value = Array.isArray(list) ? list : []
    } catch (err) {
        bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载任务失败' })
        tasks.value = []
    } finally {
        loading.value = false
    }
}

/** 点击"查看详情" → 打开 taskDetails 查看模式 */
function onViewDetail(task) {
    const pid = playerStore.player?.id
    if (!pid) return
    bus.emit(BusEvents.TASK_DETAILS_OPEN, { playerId: pid, taskId: task.id })
}

/** 关闭 */
function onClose() {
    open.value = false
    tasks.value = []
}

/** ESC 关闭 */
function onKeydown(e) {
    if (e.key === 'Escape' && open.value) onClose()
}

/** TASK_LIST_OPEN 触发打开 */
function handleOpen() {
    open.value = true
    loadTasks()
}

let offOpen = null
let offClaimUpdate = null
onMounted(() => {
    offOpen = bus.on(BusEvents.TASK_LIST_OPEN, handleOpen)
    // 交付后若弹窗开着则刷新
    offClaimUpdate = bus.on(BusEvents.TASK_CLAIM_UPDATE, () => {
        if (open.value) loadTasks()
    })
    window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
    offOpen && offOpen()
    offClaimUpdate && offClaimUpdate()
    window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
    <Dlg
        v-if="open"
        :tabs="tabs"
        :contentStyleProp="{ width: '558px', height: '500px' }"
        @close="onClose"
    >
        <div class="dqdl-task-dlg">
            <!-- 加载中 -->
            <div v-if="loading" class="task-empty">加载中...</div>

            <!-- 空态 -->
            <div v-else-if="!tasks.length" class="task-empty">暂无任务</div>

            <!-- 任务列表：文字流一行式 -->
            <div v-else class="task-list">
                <div v-for="task in tasks" :key="task.id" class="task-row">
                    <div class="task-title-detail">
                        <div class="task-top">
                            <div class="task-title">【{{ task.name }}】</div>
                            <div class="task-type">
                                佣兵任务
                            </div>
                            <Star :star="task.star || 1"></Star>
                        </div>
                        <div class="task-details" @click="onViewDetail(task)">
                            查看详情
                        </div>
                    </div>
                    <div class="task-target">
                        <div v-for="(target, index) in task.target" :key="index">
                            <div v-if="target.type === 'fight'" class="task-target-fight">
                                <div><span class="target-index">{{ index + 1 }}.</span> <span v-html="target.desc"></span></div>
                                <div class="task-target-count">({{ target.current || 0 }} / {{ target.required }})</div>
                            </div>
                            <div v-else-if="target.type === 'findNpc'" class="task-target-fight">
                                <div><span class="target-index">{{ index + 1 }}.</span> <span v-html="target.desc"></span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Dlg>
</template>

<style lang="less" scoped>
.dqdl-task-dlg{
    background: #efede9;
    height: 100%;
    overflow-y: auto;
    padding: 8px 12px;
    text-align: left;
}
.task-empty{
    text-align: center;
    color: #8a7a60;
    padding: 40px 0;
    font-size: var(--fs-md);
}
.task-list{
    display: flex;
    flex-direction: column;
    gap: 10px;
}
/* 一行式任务项：相对定位，右上角放查看详情 */
.task-row{
    position: relative;
}
.task-title-detail{
    position: relative;
    .task-top{
        display: flex;
        align-items: center;
        gap: 10px;
    }
    .task-title{
        font-size: 14px;
        font-weight: bold;
        margin: 3px 0;
        text-align: left;
    }
    .task-type{
        font-size: 12px;
    }
    .task-details{
        position: absolute;
        right: 0;
        top: 5px;
        color: #925141;
        cursor: pointer;
        text-decoration: underline;
    }
    .task-details:hover{
        color: #c80000;
    }
}
.task-view-detail{
    position: absolute;
    top: 8px;
    right: 4px;
    color: var(--accent, #b8860b);
    font-size: var(--fs-sm);
    cursor: pointer;
    &:hover{
        text-decoration: underline;
    }
}
/* 文字流：名称 → 描述 → 进度，行内排列 */
.task-line{
    line-height: 1.8;
    font-size: var(--fs-md);
}
.task-name{
    font-weight: bold;
    color: #3a2a1a;
    margin-right: 4px;
}
.task-arrow{
    color: #8a7a60;
    margin: 0 4px;
}
.task-target-desc{
    color: #4a3a28;
}
.task-progress{
    color: #c80000;
    margin-left: 2px;
}
.task-target{
    margin: 6px 4px 0 6px;
    padding: 5px 10px;
    color: #907250;
    border: 1px solid #ded9cd;
    background-color: #ece8e0;
    .task-target-fight{
        display: flex;
        justify-content: space-between;
        font-size: 13px;
        .task-target-count{
            color: #c80000;
        }
    }
}
</style>
