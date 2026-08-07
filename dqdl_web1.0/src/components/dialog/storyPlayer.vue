<script setup>
/**
 * 故事事件演出组件（StoryPlayer）。
 *
 * 数据流：
 *   进入游戏/页面刷新 → GameView 调 getCurrentStoryEvent() → 有事件则 emit STORY_EVENT_READY
 *     → 本组件监听，用 Dlg（components1/dlg.vue 通用弹窗基座）渲染当前节点。
 *
 * 渲染映射（event.node）：
 *   - node.type = choice    → 底部渲染 node.choices 选项按钮，点击 emit choose
 *   - node.type = narrative → 底部渲染「继续」按钮，点击 emit continue
 *   - node.type = ending    → 同 narrative（「继续」代表结束；advance 到 done 是后续）
 *   - node.action 非空（battle/move/reward）→ 当前先 toast 提示（原子化动作触发是后续）
 *
 * 当前范围：只做「渲染当前节点」。节点推进（advance / action 执行）下一轮接。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import Button from '@/components1/button.vue'
import { bus, BusEvents } from '@/utils/eventBus'

const open = ref(false)
const event = ref(null)       // 当前事件（getCurrentStoryEvent 返回的 event 对象）
const currentNode = ref(null) // 当前渲染的节点（event.node）

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

/** 点击某个选项 → emit choose（带选项 + 当前事件上下文） */
function onChoose(opt) {
  console.log('[StoryPlayer] choose', opt)
  bus.emit(BusEvents.TOAST, {
    type: 'info',
    message: `选择：${opt?.text || ''}（推进接口待实现）`,
  })
}

/** 无选项时点「继续」 */
function onContinue() {
  const action = currentNode.value?.action
  if (action) {
    bus.emit(BusEvents.TOAST, {
      type: 'info',
      message: `触发动作：${action.kind || ''}（待实现）`,
    })
  } else {
    bus.emit(BusEvents.TOAST, {
      type: 'info',
      message: '继续（推进接口待实现）',
    })
  }
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
      <!-- 中间：节点正文（多行按 \n 分段） -->
      <div class="sp-stage">
        <p
          v-for="(line, idx) in String(dlgText()).split('\n')"
          :key="idx"
          class="sp-line"
        >{{ line }}</p>
      </div>

      <!-- 底部：选项区（choice 节点 → 选项按钮；否则「继续」） -->
      <div class="sp-options">
        <template v-if="isChoice()">
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
        >继续</Button>
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

/* 底部选项区 */
.sp-options {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px dashed #c8b89a;
}
.sp-continue {
  opacity: 0.85;
}
</style>
