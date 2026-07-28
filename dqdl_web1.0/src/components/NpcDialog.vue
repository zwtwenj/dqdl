<script setup>
/**
 * NPC 对话弹窗（全局原子组件，用 dlg 组件重写）。
 *
 * 原子化触发：任何业务只需 emit BusEvents.NPC_DIALOG_OPEN，传 { playerId, npcId }，
 *   对话 UI / 状态 / 数据组装全部由本组件 + 后端自治处理，触发方零关心。
 *
 * 会话化对话（双轨结构）：
 *   - 打开时 createNpcSession(npcId, playerId) → server 建 dialog_session，返回 sessionId + npc
 *   - 开场白/发送都走 talkInSession(sessionId, message)
 *   - 记忆由 server 从 session.messages 提取塞入上下文，前端不再维护 history
 */
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { createNpcSession, talkInSession } from '../api'
import { dispatchDialogEvent } from '../utils/dialogEventHandlers'
import Dlg from '@/components1/dlg.vue'
import Button from '@/components1/button.vue'

/** 单次会话最大对话轮次（与后端 MAX_DIALOG_ROUNDS 保持一致） */
const MAX_DIALOG_ROUNDS = 30

const open = ref(false)
const npc = ref(null)
const sessionId = ref(null)
const playerId = ref(null)
const history = ref([])
const loading = ref(false)
const input = ref('')
const rounds = ref(0)
const reachedLimit = computed(() => rounds.value >= MAX_DIALOG_ROUNDS)

// NPC 头像：优先用自带 icon/avatar，没有则用 npc-001.png
const npcAvatar = computed(() => {
  const icon = npc.value?.icon || npc.value?.avatar || npc.value?.info?.avatar
  if (icon) return icon.startsWith('/') ? icon : `/icon/npc/${icon}`
  return '/icon/npc/npc-001.png'
})

const msgBox = ref(null)

async function scrollBottom() {
  await nextTick()
  const el = msgBox.value
  if (el) el.scrollTop = el.scrollHeight
}

async function handleOpen({ playerId: pid, npcId, npcType }) {
  open.value = true
  npc.value = null
  sessionId.value = null
  playerId.value = pid
  history.value = []
  input.value = ''
  rounds.value = 0
  loading.value = true
  try {
    const sessionRes = await createNpcSession(npcId, pid, npcType)
    sessionId.value = sessionRes.sessionId
    npc.value = sessionRes.npc
    const res = await talkInSession(sessionId.value, '')
    history.value.push({ player: '', npc: res.reply || '...' })
    rounds.value = res.rounds || 1
  } catch (err) {
    history.value.push({ player: '', npc: `（${err.message || '对话开启失败'}）` })
  } finally {
    loading.value = false
    await scrollBottom()
  }
}

async function handleSend() {
  const msg = input.value.trim()
  if (!msg || loading.value || !sessionId.value || reachedLimit.value) return
  input.value = ''
  // 乐观渲染：玩家消息立即显示，不等后端返回
  history.value.push({ player: msg, npc: '' })
  await scrollBottom()
  loading.value = true
  try {
    const res = await talkInSession(sessionId.value, msg)
    // 后端返回后，把 NPC 回复追加到最新一条（或新起一条）
    const last = history.value[history.value.length - 1]
    if (last && last.player === msg && !last.npc) {
      last.npc = res.reply || '...'
    } else {
      history.value.push({ player: '', npc: res.reply || '...' })
    }
    rounds.value = res.rounds || rounds.value + 1
    if (res.rounds >= MAX_DIALOG_ROUNDS) {
      history.value.push({ player: '', npc: '（当前对话轮数过长，请重新进行会话）' })
    }
  } catch (err) {
    // 失败：在玩家消息后追加错误提示
    history.value.push({ player: '', npc: `（${err.message || '对方没有回应'}）` })
  } finally {
    loading.value = false
    await scrollBottom()
  }
}

function close() {
  open.value = false
  npc.value = null
  sessionId.value = null
  playerId.value = null
  history.value = []
  input.value = ''
  rounds.value = 0
}

function handleEventClick(evt) {
  if (!npc.value || !playerId.value) return
  dispatchDialogEvent(evt.event, {
    evt,
    npc: npc.value,
    playerId: playerId.value,
    closeDialog: close,
  })
}

function onKeydown(e) {
  if (e.key === 'Escape' && open.value) close()
}

let offOpen = null
onMounted(() => {
  offOpen = bus.on(BusEvents.NPC_DIALOG_OPEN, handleOpen)
  window.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  offOpen && offOpen()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Dlg
    v-if="open"
    :title="npc?.name || '对话'"
    :content-style-prop="{ width: '800px', height: '640px' }"
    @close="close"
  >
    <div class="npc-dialog">
      <!-- NPC 信息条 -->
      <div class="npc-info-bar" v-if="npc">
        {{ npc.gender }} · {{ npc.age }} · {{ npc.role_name }} · {{ npc.nature_name }}
      </div>

      <!-- 快捷事件按钮 -->
      <div class="npc-actions" v-if="npc?.dialog_events?.length">
        <div
          v-for="evt in npc.dialog_events"
          :key="evt.id"
          class="npc-action-btn"
          @click="handleEventClick(evt)"
        >{{ evt.text }}</div>
      </div>

      <!-- 对话区：微信气泡风格（NPC 左 + 玩家右） -->
      <div ref="msgBox" class="npc-messages">
        <div class="msg-system" v-if="npc">你走向了{{ npc.name }}...</div>
        <template v-for="(msg, idx) in history" :key="idx">
          <!-- 玩家消息（右侧：玩家头像 + 绿色气泡） -->
          <div v-if="msg.player" class="chat-row chat-right">
            <div class="chat-bubble chat-bubble-player">{{ msg.player }}</div>
            <img src="/player/avatar.png" class="chat-avatar" alt="我">
          </div>
          <!-- NPC 消息（左侧：NPC 头像 + 白色气泡） -->
          <div v-if="msg.npc" class="chat-row chat-left">
            <img :src="npcAvatar" class="chat-avatar" alt="NPC">
            <div class="chat-bubble chat-bubble-npc">{{ msg.npc }}</div>
          </div>
        </template>
        <div v-if="loading" class="msg-loading">思考中...</div>
      </div>

      <!-- 输入区 -->
      <div class="npc-input" :class="{ 'is-limited': reachedLimit }">
        <input
          v-model="input"
          :placeholder="reachedLimit ? '当前对话轮数过长，请重新进行会话' : '说点什么...'"
          :disabled="loading || reachedLimit"
          @keyup.enter="handleSend"
        >
        <Button
          v-if="!reachedLimit"
          class="send-btn"
          :class="{ 'is-disabled': loading || !input.trim() }"
          @click="handleSend"
        >发送</Button>
        <span v-else class="round-limit-tip">已达上限</span>
      </div>
    </div>
  </Dlg>
</template>

<style lang="less" scoped>
.npc-dialog{
    display: flex;
    flex-direction: column;
    height: 100%;
}
/* NPC 信息条 */
.npc-info-bar{
    padding: 6px 12px;
    font-size: var(--fs-sm);
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
    background: var(--panel-bg-soft);
}
/* 快捷事件按钮区 */
.npc-actions{
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    .npc-action-btn{
        flex-shrink: 0;
        text-decoration: underline;
        cursor: pointer;
    }
    .npc-action-btn:hover{
      color: var(--link);
    }
}
/* 对话区 */
.npc-messages{
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    min-height: 0;
}
.msg-system{
    color: var(--text-faint);
    font-style: italic;
    text-align: center;
    margin-bottom: 10px;
    font-size: var(--fs-sm);
}
/* 微信风格聊天气泡 */
.chat-row{
    display: flex;
    align-items: flex-start;
    margin-bottom: 12px;
    gap: 8px;
    .chat-avatar{
        width: 36px;
        height: 36px;
        border-radius: 4px;
        flex-shrink: 0;
        object-fit: cover;
        border: 1px solid var(--border);
    }
    .chat-bubble{
        max-width: 70%;
        padding: 8px 12px;
        font-size: var(--fs-sm);
        line-height: 1.6;
        word-break: break-all;
        position: relative;
    }
}
/* NPC 消息（左侧） */
.chat-left{
    flex-direction: row;
    .chat-bubble-npc{
        background: #ffffff;
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 4px 12px 12px 12px;   /* 左上角小尖角 */
    }
    /* 气泡左侧小三角 */
    .chat-bubble-npc::before{
        content: '';
        position: absolute;
        left: -6px;
        top: 10px;
        border: 6px solid transparent;
        border-right-color: #ffffff;
    }
}
/* 玩家消息（右侧：气泡 + 头像，整行靠右） */
.chat-right{
    justify-content: flex-end;
    .chat-bubble-player{
        background: #95ec69;              /* 微信绿 */
        color: #000;
        border-radius: 12px 4px 12px 12px; /* 右上角小尖角 */
    }
    .chat-bubble-player::before{
        content: '';
        position: absolute;
        right: -6px;
        top: 10px;
        border: 6px solid transparent;
        border-left-color: #95ec69;
    }
}
.msg-loading{
    color: var(--text-dim);
    font-style: italic;
    text-align: center;
    font-size: var(--fs-sm);
}
/* 输入区 */
.npc-input{
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    background: var(--panel-bg-soft);
    input{
        flex: 1;
        padding: 5px 10px;
        background: var(--input-bg);
        border: 1px solid var(--border);
        border-radius: 2px;
        color: var(--text);
        font-size: var(--fs-sm);
        outline: none;
        &:focus{ border-color: var(--accent); }
        &::placeholder{ color: var(--text-faint); }
    }
    .send-btn{
        flex-shrink: 0;
    }
    .send-btn.is-disabled{
        opacity: 0.5;
        pointer-events: none;
    }
    .round-limit-tip{
        flex-shrink: 0;
        padding: 5px 10px;
        font-size: var(--fs-sm);
        color: var(--danger);
        white-space: nowrap;
    }
    &.is-limited input{
        border-color: var(--danger);
    }
}
</style>
