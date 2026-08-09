<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getActiveTraining, getNewTrainingLogs } from '@/api/training'
import { getMyTasks } from '@/api/task'
import { usePlayerStore } from '@/stores/player'
import { useGameStore } from '@/stores/game'
import { bus, BusEvents } from '@/utils/eventBus'
import Star from '@/components1/star.vue'

const playerStore = usePlayerStore()
const gameStore = useGameStore()

const tabs = ref([
    { name: '当前任务', value: 'task' },
    { name: '历练日志', value: 'training' },
    { name: '采集日志', value: 'gather' },
    { name: '其他', value: 'other' }
])

/** 日志文本按关键词高亮（复用 AdventureLog 的实现）：keywords=[{text,type}]，
 *  type=mob/location/skill/item/player 对应不同颜色。返回 HTML 字符串。 */
function highlight(text, keywords) {
    if (!text) return ''
    let html = String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    const kws = []
    try {
        const arr = typeof keywords === 'string' ? JSON.parse(keywords) : keywords
        if (Array.isArray(arr)) {
            const seen = new Set()
            for (const k of arr) {
                if (k.text && !seen.has(k.text)) { seen.add(k.text); kws.push(k) }
            }
        }
    } catch { /* ignore */ }
    kws.sort((a, b) => b.text.length - a.text.length)
    for (const kw of kws) {
        const cls = `hl-${kw.type || 'mob'}`
        const escaped = kw.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        html = html.replace(new RegExp(escaped, 'g'), `<span class="${cls}">$&</span>`)
    }
    return html
}

/** 解析掉落物 JSON → [{item_id,name,count}] */
function parseDrops(drops) {
    if (!drops) return []
    try {
        const arr = typeof drops === 'string' ? JSON.parse(drops) : drops
        return Array.isArray(arr) ? arr : []
    } catch { return [] }
}

/** 格式化时间 HH:MM:SS（日志的 created_at） */
function fmtTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const focusTab = ref('task')
function onTabClick(value) {
    focusTab.value = value
    // 切到历练日志：若尚未初始化（无数据且非轮询中），拉一次全量
    if (value === 'training' && !trainingLogs.value.length && !trainingTimer) {
        initTraining()
    }
}

// —— 当前任务列表（复用 task.vue 的 .dqdl-task-dlg 样式）——
const tasks = ref([])
async function loadTasks() {
    const pid = gameStore.playerId
    if (!pid) return
    try {
        tasks.value = (await getMyTasks(pid)) || []
    } catch {
        tasks.value = []
    }
}
function onViewTaskDetail(task) {
    bus.emit(BusEvents.TASK_DETAILS_OPEN, { playerId: Number(gameStore.playerId), taskId: task.id })
}

// —— 历练日志：SSE 推送驱动 ——
// 初始化：getActiveTraining 拉全量日志 + 记录 lastLogId
// 后续：后端每生成一条日志经 SSE 推 training_log → 增量拉取新日志（不再轮询）
const trainingLogs = ref([])
const trainingActive = ref(false)
let lastLogId = 0        // 已加载的最后一条日志 id（增量对比用）

/** 初始化：拉当前历练全量日志（进入游戏/发起历练后调用）。
 *  后端 getActiveTraining 返回 logs 是 DESC（新→旧），反转成 ASC（旧→新），
 *  这样 lastLogId 取末尾=最新，后续增量追加顺序正确。 */
async function initTraining() {
    try {
        const data = await getActiveTraining()
        if (data) {
            trainingActive.value = true
            const logs = (data.logs || []).slice().reverse()  // DESC → ASC
            trainingLogs.value = logs
            lastLogId = logs.length ? logs[logs.length - 1].id : 0
        } else {
            trainingActive.value = false
            trainingLogs.value = []
            lastLogId = 0
        }
    } catch {
        // 静默
    }
}

/** 增量拉取：只拉 id > lastLogId 的新日志，有则追加（由 SSE training_log 触发） */
async function pollNewLogs() {
    if (!trainingActive.value) return
    try {
        const res = await getNewTrainingLogs(lastLogId)
        if (!res?.active) {
            // 历练已结束
            trainingActive.value = false
            return
        }
        const newLogs = res.logs || []
        if (newLogs.length) {
            trainingLogs.value.push(...newLogs)
            lastLogId = newLogs[newLogs.length - 1].id
        }
    } catch {
        // 静默
    }
}

/** 历练结束（SSE training_finished）：标记结束，拉最终增量 */
async function onTrainingFinished() {
    await pollNewLogs()   // 拉最终增量
    trainingActive.value = false
}

// 监听历练状态切换（mapView 发起历练/停止时触发）
let offTrainingToggle = null
let offTaskUpdate = null
let offTrainingLog = null
let offTrainingFinished = null
onMounted(() => {
    initTraining()   // 进入游戏：若历练中，拉全量日志
    loadTasks()      // 拉当前任务列表
    offTrainingToggle = bus.on(BusEvents.TRAINING_TOGGLE, ({ active }) => {
        if (active) {
            initTraining()   // 发起历练：重新初始化（全量）
        }
    })
    // 历练新日志（SSE training_log）→ 增量拉取
    offTrainingLog = bus.on(BusEvents.TRAINING_LOG, () => pollNewLogs())
    // 历练结束（SSE training_finished）→ 拉最终增量 + 标记结束
    offTrainingFinished = bus.on(BusEvents.TRAINING_FINISHED, () => onTrainingFinished())
    // 任务数据更新（SSE：击杀计数/接受/放弃）→ 重新拉任务列表
    offTaskUpdate = bus.on(BusEvents.TASK_UPDATE, () => loadTasks())
    // 玩家状态变化（如历练结束 status→IDLE）也刷新
    playerStore.$subscribe(() => {
        if (playerStore.player?.status !== 2 && trainingActive.value) {
            trainingActive.value = false
        }
    })
})
onUnmounted(() => {
    offTrainingToggle?.()
    offTaskUpdate?.()
    offTrainingLog?.()
    offTrainingFinished?.()
})
</script>

<template>
    <div class="dqdl-information">
        <div class="information-tabs">
            <div
                class="information-tab"
                :class="{ 'tab-is-active': focusTab === tab.value }"
                v-for="tab in tabs"
                :key="tab.value"
                @click="onTabClick(tab.value)"
            >{{ tab.name }}</div>
        </div>
        <div class="information-content">
            <!-- 当前任务（复用 task.vue 的列表结构与样式） -->
            <template v-if="focusTab === 'task'">
                <div class="dqdl-task-dlg">
                    <div v-if="!tasks.length" class="task-empty">暂无任务</div>
                    <div v-else class="task-list">
                        <div v-for="task in tasks" :key="task.id" class="task-row">
                            <div class="task-title-detail">
                                <div class="task-top">
                                    <div class="task-title">【{{ task.name }}】</div>
                                    <div class="task-type">佣兵任务</div>
                                    <Star :star="task.star || 1"></Star>
                                </div>
                                <div class="task-details" @click="onViewTaskDetail(task)">查看详情</div>
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
                                    <!-- 前往某地（含前往某地击败怪物） -->
                                    <div v-else-if="target.type === 'go_to_location' || target.type === 'go_to_location_defeat_mob'" class="task-target-fight">
                                        <div><span class="target-index">{{ index + 1 }}.</span> <span v-html="target.desc"></span></div>
                                        <div class="task-target-count">({{ target.current || 0 }} / {{ target.required }})</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
            <!-- 历练日志 -->
            <template v-else-if="focusTab === 'training'">
                <div v-if="!trainingLogs.length" class="info-empty">
                    {{ trainingActive ? '历练中，等待战斗记录...' : '尚未进行历练' }}
                </div>
                <div v-else class="training-log-list">
                    <div v-for="log in trainingLogs" :key="log.id" class="training-log-item">
                        <span class="training-log-time">{{ fmtTime(log.created_at) }}</span>
                        <span class="training-log-result" :class="{ win: log.won === 1, flee: log.won === 0 }">
                            {{ log.mob_id === 'encounter' ? '奇遇' : (log.won === 1 ? '胜利' : '逃跑') }}
                        </span>
                        <p class="training-log-text" v-html="highlight(log.content, log.keywords)"></p>
                        <div class="training-log-drops" v-if="parseDrops(log.drops).length">
                            <span v-for="d in parseDrops(log.drops)" :key="d.item_id" class="drop-item">{{ d.name }}×{{ d.count }}</span>
                        </div>
                    </div>
                </div>
            </template>
            <!-- 采集日志 -->
            <template v-else-if="focusTab === 'gather'">
                <div class="info-empty">采集功能待接入</div>
            </template>
            <!-- 其他 -->
            <template v-else>
                <div class="info-empty">暂无内容</div>
            </template>
        </div>
    </div>
</template>

<style lang="less" scoped>
.dqdl-information{
    margin-top: 10px;
    display: flex;
    border: 1px solid #c3b8b1;
    height: 140px;
    .information-tabs{
        width: 110px;
        padding: 10px 0;
        .information-tab{
            height: 30px;
            line-height: 30px;
            text-align: center;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
        }
        .tab-is-active{
            background: url("/static/field-switch-button.gif") no-repeat;
            color: var(--danger);
        }
    }
    .information-content{
        background-color: #f5f2ea;
        flex: 1;
        padding: 10px;
        overflow-y: auto;
    }
}
.info-empty{
    color: var(--text-faint);
    font-style: italic;
    text-align: center;
    padding: 30px 0;
}
.training-log-list{
    .training-log-item{
        padding: 4px 0;
        border-bottom: 1px dashed var(--border);
        .training-log-time{
            font-size: 10px;
            color: var(--text-faint);
            margin-right: 6px;
        }
        .training-log-result{
            font-size: 11px;
            font-weight: bold;
            margin-right: 6px;
            &.win{ color: var(--status-ok); }
            &.flee{ color: var(--text-dim); }
        }
        .training-log-text{
            font-size: 12px;
            color: var(--text);
            line-height: 18px;
            margin: 2px 0;
            /* 关键词高亮配色（复用 AdventureLog，适配浅色主题） */
            :deep(.hl-mob){ color: #c0392b; font-weight: 600; }
            :deep(.hl-location){ color: #2980b9; font-weight: 600; }
            :deep(.hl-skill){ color: #8e44ad; font-weight: 600; }
            :deep(.hl-item){ color: #c09020; font-weight: 600; }
            :deep(.hl-player){ color: #27ae60; font-weight: 600; }
        }
        .training-log-drops{
            margin-top: 2px;
            .drop-item{
                display: inline-block;
                font-size: 11px;
                color: var(--gold);
                background: rgba(240, 192, 64, 0.12);
                padding: 0 4px;
                margin-right: 4px;
                border-radius: 2px;
            }
        }
    }
}

/* 当前任务列表（复用 task.vue 的 .dqdl-task-dlg 样式） */
.dqdl-task-dlg{
    padding: 4px 4px;
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
