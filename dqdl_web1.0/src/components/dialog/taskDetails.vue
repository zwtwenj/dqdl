<script setup>
/**
 * 任务详情弹窗（双模式，全局原子组件，App.vue 挂载一次）。
 *
 * 全程 taskId 驱动（降耦合 + 防篡改），组件自己拉单条任务详情：
 *   接取模式：bus.on(TASK_ACCEPT_OPEN, { playerId }) → preview 生成草稿拿 taskId → getTask 拉单条
 *             「接受」accept(draft→pending) / 「换一个」reject旧+preview新 / 「拒绝」reject(draft→delete)
 *   查看模式：bus.on(TASK_DETAILS_OPEN, { playerId, taskId }) → getTask 拉单条（只读展示进度）
 *
 * 字段对齐后端 task 视图：name / description / target[].desc / target[].type(fight|findNpc)
 *   / reward[]（数组）/ star / giver_npc_name（发布人，fallback '佣兵公会接待员'）
 *
 * 显隐：内部 open ref + <Dlg v-if="open">，监听 Dlg @close 关闭。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import Button from '@/components1/button.vue'
import star from '@/components1/star.vue'
import { bus, BusEvents } from '@/utils/eventBus'
import { confirm } from '@/components1/confirm'
import {
  previewAdventurerTask,
  acceptAdventurerTask,
  rejectTask,
  getTask,
  abandonTask,
} from '@/api/task'

/** 'accept' 接取候选 / 'view' 查看已接任务 */
const mode = ref('accept')
const open = ref(false)
const playerId = ref(null)
const npcId = ref(null)
const npcName = ref(null)
const taskId = ref(null)
const task = ref(null)
const loading = ref(false)
const accepting = ref(false)

/** 发布人名（fallback 佣兵公会接待员） */
const giverName = computed(
  () => task.value?.giver_npc_name || '佣兵公会接待员',
)

/** 是否所有目标已达标（查看模式下展示「可交付」状态） */
const allDone = computed(() => {
  const targets = task.value?.target
  if (!Array.isArray(targets) || !targets.length) return false
  return targets.every((t) => (t.current || 0) >= (t.required || 0))
})

// ---------- 通用：拉单条任务 ----------

/** 用 taskId 拉单条任务详情 */
async function loadTask() {
  if (!taskId.value) return
  loading.value = true
  task.value = null
  try {
    const data = await getTask(taskId.value)
    if (data && data.id) {
      task.value = data
    } else {
      bus.emit(BusEvents.TOAST, { type: 'info', message: '任务不存在或已失效' })
      open.value = false
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载任务失败' })
    open.value = false
  } finally {
    loading.value = false
  }
}

// ---------- 接取模式 ----------

/** preview 生成草稿 → 拿 taskId → 拉单条 */
async function loadPreview() {
  if (!playerId.value) return
  loading.value = true
  task.value = null
  taskId.value = null
  try {
    const res = await previewAdventurerTask(playerId.value, npcId.value, npcName.value)
    if (res?.ok && res.taskId) {
      taskId.value = res.taskId
      await loadTask()
    } else {
      bus.emit(BusEvents.TOAST, { type: 'info', message: res?.msg || '无法接取任务' })
      open.value = false
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '生成任务失败' })
    open.value = false
  } finally {
    loading.value = false
  }
}

/** 接受草稿（draft → pending） */
async function onAccept() {
  if (!taskId.value || accepting.value) return
  accepting.value = true
  try {
    const res = await acceptAdventurerTask(playerId.value, taskId.value)
    if (res?.ok) {
      bus.emit(BusEvents.TOAST, { type: 'success', message: `已接受任务：${task.value?.name || ''}` })
      taskId.value = null
      task.value = null
      open.value = false
    } else {
      bus.emit(BusEvents.TOAST, { type: 'info', message: res?.msg || '接受失败' })
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '接受任务失败' })
  } finally {
    accepting.value = false
  }
}

/** 放弃任务（查看模式，二次确认 → abandonTask → 关闭详情） */
async function onAbandon() {
  if (!taskId.value) return
  const ok = await confirm({ title: '放弃任务', content: '是否放弃该任务？放弃后不可恢复。' })
  if (!ok) return
  try {
    const res = await abandonTask(taskId.value, playerId.value)
    if (res?.ok) {
      bus.emit(BusEvents.TOAST, { type: 'success', message: '已放弃任务' })
      onClose()
    } else {
      bus.emit(BusEvents.TOAST, { type: 'info', message: res?.msg || '放弃失败' })
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '放弃失败' })
  }
}

/** 换一个：旧草稿 reject(delete) → preview 新草稿 */
async function onReroll() {
  if (loading.value) return
  // 先拒绝当前草稿（draft → delete），失败不阻断换一个
  if (taskId.value) {
    try {
      await rejectTask(playerId.value, taskId.value)
    } catch (e) {
      // 静默：超时清理也会兜底
    }
  }
  await loadPreview()
}

// ---------- 通用：关闭 ----------

/** 关闭。接取模式下若任务仍是草稿，主动 reject 避免草稿残留（超时清理兜底） */
function onClose() {
  // 接取模式 + 当前是 draft：异步标记 delete（不阻塞关闭）
  if (mode.value === 'accept' && taskId.value && task.value?.status === 'draft') {
    rejectTask(playerId.value, taskId.value).catch(() => {})
  }
  open.value = false
  taskId.value = null
  task.value = null
}

/** ESC 关闭 */
function onKeydown(e) {
  if (e.key === 'Escape' && open.value) onClose()
}

/** 接取模式触发 */
function handleAcceptOpen({ playerId: pid, npcId: nid, npcName: nname }) {
  mode.value = 'accept'
  playerId.value = pid
  npcId.value = nid ?? null
  npcName.value = nname ?? null
  open.value = true
  loadPreview()
}

/** 查看模式触发 */
function handleDetailsOpen({ playerId: pid, taskId: tid }) {
  mode.value = 'view'
  playerId.value = pid
  taskId.value = tid
  open.value = true
  loadTask()
}

let offAccept = null
let offDetails = null
onMounted(() => {
  offAccept = bus.on(BusEvents.TASK_ACCEPT_OPEN, handleAcceptOpen)
  offDetails = bus.on(BusEvents.TASK_DETAILS_OPEN, handleDetailsOpen)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  offAccept && offAccept()
  offDetails && offDetails()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
    <Dlg
        v-if="open"
        title="佣兵任务"
        :contentStyleProp="{ width: '580px' }"
        @close="onClose"
    >
        <div class="dqdl-task-details-dlg">
            <!-- 加载中 -->
            <div v-if="loading" class="task-loading">
                正在寻找合适的委托...
            </div>

            <template v-else-if="task">
                <!-- 标题 + 星级 -->
                <div class="task-title-star">
                    <div class="task-title">
                        【{{ task.name }}】
                    </div>
                    <star :star="task.star || 1"></star>
                </div>
                <div class="line"></div>

                <!-- NPC 对话气泡 -->
                <div class="npc-dlg">
                    <div class="npc-dlg-bg">
                        <div class="task-public-description">
                            <div class="task-public">
                                {{ giverName }} ：
                            </div>
                            <div class="task-description" v-html="task.description"></div>
                        </div>
                        <div class="task-public-img">
                            <img src="/static/19.jpg">
                        </div>
                    </div>
                </div>
                <div class="line"></div>

                <!-- 奖励 -->
                <div class="task-reward">
                    <div class="task-reward-title">任务奖励</div>
                    <div class="task-reward-list">
                        <template v-for="(r, i) in (task.reward || [])" :key="i">
                            <span v-if="r.type === 'money' && r.value">
                                金币：<span class="task-reward-keyward">{{ r.value }}</span>
                            </span>
                            <span v-else-if="r.name">
                                {{ r.name }}：<span class="task-reward-keyward">×{{ r.count || 1 }}</span>
                            </span>
                        </template>
                    </div>
                </div>
                <div class="line"></div>

                <!-- 目标（按 type 分支） -->
                <div class="task-target">
                    <div class="task-target-title">任务目标</div>
                    <div class="task-target-list">
                        <div v-for="(target, index) in task.target" :key="index">
                            <div v-if="target.type === 'fight'" class="task-target-fight">
                                <span><span class="target-index">{{ index + 1 }}.</span> <span v-html="target.desc"></span></span>
                                <span class="task-target-count">({{ target.current || 0 }} / {{ target.required }})</span>
                            </div>
                            <div v-else-if="target.type === 'findNpc'" class="task-target-fight">
                                <span><span class="target-index">{{ index + 1 }}.</span> <span v-html="target.desc"></span></span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="line"></div>

                <!-- 操作按钮 -->
                <div class="task-btn">
                    <template v-if="mode === 'accept'">
                        <Button @click="onAccept">{{ accepting ? '接受中...' : '接受' }}</Button>
                        <Button @click="onReroll">换一个</Button>
                        <Button @click="onClose">拒绝</Button>
                    </template>
                    <template v-else>
                        <span v-if="allDone" class="view-hint done">
                            目标已全部完成，请回佣兵公会交付
                        </span>
                        <span v-else class="view-hint">任务进行中...</span>
                        <Button v-if="task.abandonable" class="abandon-btn" @click="onAbandon">放弃任务</Button>
                    </template>
                </div>
            </template>
        </div>
    </Dlg>
</template>

<style lang="less" scoped>
.dqdl-task-details-dlg{
    height: 100%;
    overflow-y: auto;
}
.task-loading{
    padding: 50px 16px;
    text-align: center;
    color: rgba(120, 100, 70, 0.7);
    letter-spacing: 2px;
}
.line{
    height: 1px;
    background: #b1a9a7;
}
.task-title-star{
    display: flex;
    justify-content: space-between;
    align-items: center;
    .task-title{
        font-size: 14px;
        font-weight: bold;
        margin: 3px 0;
        text-align: left;
    }
}
.npc-dlg{
    width: 550px;
    margin: 10px auto 10px auto;
    background: #ece9e1;
    border-radius: 5px;
    height: 160px;
    padding:3px;
    .npc-dlg-bg{
        background: #f6f4ef;
        width: 100%;
        height: 100%;
        border-radius: 5px;
        border: 1px solid #bbb09a;
        display: flex;
        align-items: center;
        justify-content: space-between;
        .task-public-description{
            width: 320px;
            position: relative;
            background: #ffffff;
            border: 1px solid #bbb09a;
            border-radius: 8px 2px 8px 8px;
            padding: 8px 12px;
            margin-right: 10px;
            margin-left: 20px;
            text-align: left;
        }
        /* 气泡右侧箭头：用旋转方块做三角，比 border 技巧更可靠 */
        .task-public-description::after{
            content: '';
            position: absolute;
            right: -6px;
            top: 16px;
            width: 10px;
            height: 10px;
            background: #ffffff;
            border-right: 1px solid #bbb09a;
            border-top: 1px solid #bbb09a;
            transform: rotate(45deg);
        }
        .task-public{
            font-weight: bold;
            color: #6b4423;
            margin-bottom: 4px;
        }
        .task-description{
            font-size: 13px;
            line-height: 1.7;
            color: #3a2a1a;
        }
    }
}
.task-public-img{
    flex-shrink: 0;
    width: 110px;
    height: 140px;
    margin-right: 8px;
    img{
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 4px;
        -webkit-user-drag: none;
    }
}
.task-reward{
    margin: 10px auto;
    .task-reward-title{
        font-size: 14px;
        font-weight: bold;
        margin: 3px 0;
        text-align: left;
    }
    .task-reward-list{
        display: flex;
        gap: 16px;
        font-size: 13px;
        .task-reward-keyward{
            color: #c80000;
        }
    }
}
.task-target{
    margin: 10px auto;
    .task-target-title{
        font-size: 14px;
        font-weight: bold;
        margin: 3px 0;
        text-align: left;
    }
    .task-target-list{
        text-align: left;
        .task-target-fight{
            display: flex;
            justify-content: space-between;
            font-size: 13px;
            .task-target-count{
                color: #c80000;
            }
        }
    }
}
.task-btn{
    margin-top: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
}
.view-hint{
    font-size: 13px;
    color: #8a7a60;
    letter-spacing: 1px;
}
.view-hint.done{
    color: #b8860b;
    font-weight: bold;
}
.abandon-btn{

}
</style>
