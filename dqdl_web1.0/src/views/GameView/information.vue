<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { getActiveTraining, getNewTrainingLogs } from '@/api/training'
import { usePlayerStore } from '@/stores/player'
import { bus, BusEvents } from '@/utils/eventBus'

const playerStore = usePlayerStore()

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

// —— 历练日志：增量轮询 ——
// 初始化：getActiveTraining 拉全量日志 + 记录 lastLogId
// 后续：getNewTrainingLogs(lastLogId) 只拉增量，有新日志则追加 + 更新 lastLogId
const trainingLogs = ref([])
const trainingActive = ref(false)
let lastLogId = 0        // 已加载的最后一条日志 id（增量对比用）
let trainingTimer = null

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
            startPolling()
        } else {
            trainingActive.value = false
            trainingLogs.value = []
            lastLogId = 0
            stopPolling()
        }
    } catch {
        // 静默
    }
}

/** 增量拉取：只拉 id > lastLogId 的新日志，有则追加 */
async function pollNewLogs() {
    try {
        const res = await getNewTrainingLogs(lastLogId)
        if (!res?.active) {
            // 历练已结束
            trainingActive.value = false
            stopPolling()
            return
        }
        if (res.finished) {
            // 后端标记结束（status≠0），拉最终增量后停止
            trainingActive.value = false
            stopPolling()
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

function startPolling() {
    if (trainingTimer) return
    trainingTimer = setInterval(pollNewLogs, 5000)  // 5秒增量拉一次
}
function stopPolling() {
    if (trainingTimer) { clearInterval(trainingTimer); trainingTimer = null }
}

// 监听历练状态切换（mapView 发起历练/停止时触发）
let offTrainingToggle = null
onMounted(() => {
    initTraining()   // 进入游戏：若历练中，拉全量日志 + 启动增量轮询
    offTrainingToggle = bus.on(BusEvents.TRAINING_TOGGLE, ({ active }) => {
        if (active) {
            initTraining()   // 发起历练：重新初始化（全量+轮询）
        } else {
            stopPolling()
            pollNewLogs()    // 停止后拉最终增量
        }
    })
    // 玩家状态变化（如历练结束 status→IDLE）也刷新
    playerStore.$subscribe(() => {
        if (playerStore.player?.status !== 2 && trainingActive.value) {
            trainingActive.value = false
            stopPolling()
        }
    })
})
onUnmounted(() => {
    stopPolling()
    offTrainingToggle?.()
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
            <!-- 当前任务 -->
            <template v-if="focusTab === 'task'">
                <div class="info-empty">暂无任务</div>
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
</style>
