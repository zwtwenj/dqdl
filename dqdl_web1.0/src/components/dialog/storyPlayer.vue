<script setup>
/**
 * 故事事件演出组件（StoryPlayer）。
 *
 * 数据流：
 *   进入游戏/页面刷新 → GameView 调 getCurrentStoryEvent() → 有事件则 emit STORY_EVENT_READY
 *     → 本组件监听，用 Dlg（components1/dlg.vue 通用弹窗基座）渲染当前节点。
 *   点「继续/选项」→ advanceStory() 推进：
 *     - 连线配置为发布任务 → { result: 'task_issued' } → 关弹窗（任务列表经 TASK_UPDATE 刷新）
 *     - 正常推进 → 更新当前节点继续渲染；done → 关弹窗
 *   任务完成后后端推 story_event SSE → 前端重新拉 /current → 弹窗在新节点重开。
 *
 * 渲染映射（event.node）：
 *   - node.type = choice    → 底部渲染 node.choices 选项按钮，点击带 goto 推进
 *   - node.type = narrative → 底部渲染「继续」按钮
 *   - node.type = ending    → 同 narrative（推进后 done 关弹窗）
 *   - event.pending_task_id 非空 → 显示"任务进行中"占位（故事停在当前节点等任务完成）
 */
import { ref, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import Button from '@/components1/button.vue'
import { bus, BusEvents } from '@/utils/eventBus'
import { advanceStory } from '@/api/story'

const open = ref(false)
const event = ref(null)       // 当前事件（getCurrentStoryEvent 返回的 event 对象）
const currentNode = ref(null) // 当前渲染的节点（event.node）
const loading = ref(false)    // 推进请求中

/** 打开：接收 STORY_EVENT_READY 载荷，渲染当前节点 */
function handleEventReady({ event: ev }) {
  if (!ev?.node) return
  event.value = ev
  currentNode.value = ev.node
  open.value = true
}

/** Dlg 标题：事件标题 */
function dlgTitle() {
  return event.value?.title || '事件'
}

/** 节点正文（适配后结构统一用 text） */
function dlgText() {
  return currentNode.value?.text || ''
}

/** 是否 choice 节点（有选项按钮） */
function isChoice() {
  return currentNode.value?.type === 'choice' &&
    Array.isArray(currentNode.value?.choices) &&
    currentNode.value.choices.length > 0
}

/** 故事停在任务上（等待任务完成） */
function isTaskPending() {
  return !!event.value?.pending_task_id
}

/** 推进故事：点「继续」（narrative 不传 goto）/ 选项（传 goto） */
async function doAdvance(goto) {
  const inst = event.value
  if (!inst?.instance_id || loading.value) return
  loading.value = true
  try {
    const res = await advanceStory(inst.instance_id, goto)
    if (res?.ok && res.result === 'task_issued') {
      // 发布任务：关弹窗，任务列表由 TASK_UPDATE SSE 刷新
      bus.emit(BusEvents.TOAST, { type: 'success', message: res.message || '任务已发布，完成后自动继续' })
      onClose()
    } else if (res?.ok && res.done) {
      bus.emit(BusEvents.TOAST, { type: 'success', message: '事件结束' })
      onClose()
    } else if (res?.ok && res.node) {
      // 正常推进到下一节点
      currentNode.value = res.node
      event.value = { ...inst, current_node: res.current_node, node: res.node }
    } else if (res?.ok && res.result === 'task_pending') {
      bus.emit(BusEvents.TOAST, { type: 'warning', message: res.message || '任务进行中' })
      onClose()
    } else {
      bus.emit(BusEvents.TOAST, { type: 'error', message: res?.msg || res?.message || '推进失败' })
    }
  } catch {
    bus.emit(BusEvents.TOAST, { type: 'error', message: '推进失败，请重试' })
  } finally {
    loading.value = false
  }
}

/** 点击某个选项 → 带 goto 推进 */
function onChoose(opt) {
  doAdvance(opt?.goto)
}

/** 无选项时点「继续」（narrative 直接推进） */
function onContinue() {
  doAdvance()
}

/** 关闭弹窗 */
function onClose() {
  open.value = false
}

let offReady = null
onMounted(() => {
  offReady = bus.on(BusEvents.STORY_EVENT_READY, handleEventReady)
})
onUnmounted(() => {
  offReady && offReady()
})
</script>

<template>
  <Dlg
    v-if="open"
    :title="dlgTitle()"
    :contentStyleProp="{ width: '680px' }"
    @close="onClose"
  >
    <div class="story-player">
      <!-- 中间：任务等待占位 或 节点正文（多行按 \n 分段） -->
      <div class="sp-stage">
        <p v-if="isTaskPending()" class="sp-line sp-pending">任务进行中，请先完成任务目标，完成后自动继续…</p>
        <template v-else>
          <p
            v-for="(line, idx) in String(dlgText()).split('\n')"
            :key="idx"
            class="sp-line"
          >{{ line }}</p>
        </template>
      </div>

      <!-- 底部：任务等待 → 「知道了」；choice 节点 → 选项按钮；否则「继续」 -->
      <div class="sp-options">
        <Button
          v-if="isTaskPending()"
          class="sp-option sp-continue"
          @click="onClose"
        >知道了</Button>
        <template v-else-if="isChoice()">
          <Button
            v-for="(opt, idx) in currentNode.choices"
            :key="idx"
            class="sp-option"
            @click="onChoose(opt)"
          >{{ opt.text }}</Button>
        </template>
        <Button
          v-else
          class="sp-option sp-continue"
          @click="onContinue"
        >{{ loading ? '推进中…' : '继续' }}</Button>
      </div>
    </div>
  </Dlg>
</template>

<style lang="less" scoped>
.story-player {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 中间文本区 */
.sp-stage {
  overflow-y: auto;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sp-line {
  font-size: 14px;
  line-height: 1.9;
  color: #4a3a2a;
  text-indent: 2em;
  margin: 0;
  word-break: break-all;
  white-space: pre-wrap;
}
.sp-pending {
  color: #a08c6a;
  text-indent: 0;
  text-align: center;
}

/* 底部选项区 */
.sp-options {
  // display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed #c8b89a;

  /* 选项按钮：下划线文字形式（覆盖 Button 图片背景） */
  :deep(.dqdl-button) {
    background: none;
    width: auto;
    height: auto;
    line-height: 1.8;
    padding: 0 4px;
    color: #6b4423;
    text-decoration: underline;
    text-underline-offset: 4px;
    text-decoration-color: #b89a70;
  }
  :deep(.dqdl-button:hover) {
    background: none;
    color: var(--accent-hover, #c0392b);
    text-decoration-color: currentColor;
  }
}
.sp-continue {
  opacity: 0.85;
}
</style>
