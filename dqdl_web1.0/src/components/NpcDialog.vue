<script setup>
/**
 * NPC 对话弹窗（全局原子组件）。
 *
 * 原子化触发：任何业务只需 emit BusEvents.NPC_DIALOG_OPEN，传 { playerId, npcId }，
 *   对话 UI / 状态 / 数据组装全部由本组件 + 后端自治处理，触发方零关心。
 *   复刻 ToastMessage 的全局挂载模式（App.vue 挂载一次，监听事件总线）。
 *
 * 会话化对话（双轨结构）：
 *   - 打开时 createNpcSession(npcId, playerId) → server 建 dialog_session，返回 sessionId + npc
 *   - 开场白/发送都走 talkInSession(sessionId, message)
 *   - 记忆由 server 从 session.messages 提取塞入上下文，前端不再维护 history
 *   - 本地 history 仅用于渲染气泡（server 是权威源）
 */
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { createNpcSession, talkInSession } from '../api'
import { dispatchDialogEvent } from '../utils/dialogEventHandlers'

/** 单次会话最大对话轮次（与后端 MAX_DIALOG_ROUNDS 保持一致） */
const MAX_DIALOG_ROUNDS = 30

const open = ref(false)
const npc = ref(null)        // NPC 详情（含 name/gender/age/role_name/nature_name/dialog_events）
const sessionId = ref(null)  // server 会话 id（记忆权威源）
const playerId = ref(null)   // 当前玩家 id（emit 商店事件用）
const history = ref([])      // [{ player, npc }] 仅渲染用，权威在 server
const loading = ref(false)
const input = ref('')
const rounds = ref(0)        // 当前会话轮次（后端返回，达上限禁用输入）
/** 是否已达轮次上限（禁用输入 + 显示提示） */
const reachedLimit = computed(() => rounds.value >= MAX_DIALOG_ROUNDS)

const msgBox = ref(null)

/** 自动滚到底 */
async function scrollBottom() {
  await nextTick()
  const el = msgBox.value
  if (el) el.scrollTop = el.scrollHeight
}

/** 打开对话：{ playerId, npcId } → 建会话 → 取开场白 */
async function handleOpen({ playerId: pid, npcId }) {
  open.value = true
  npc.value = null
  sessionId.value = null
  playerId.value = pid
  history.value = []
  input.value = ''
  rounds.value = 0
  loading.value = true
  try {
    // 1. 创建会话（server 建 dialog_session，返回 sessionId + npc 详情）
    const sessionRes = await createNpcSession(npcId, pid)
    sessionId.value = sessionRes.sessionId
    npc.value = sessionRes.npc
    // 2. 取 AI 开场白（message 为空 → agent 生成开场白）
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

/** 发送消息 */
async function handleSend() {
  const msg = input.value.trim()
  if (!msg || loading.value || !sessionId.value || reachedLimit.value) return
  input.value = ''
  loading.value = true
  try {
    const res = await talkInSession(sessionId.value, msg)
    history.value.push({ player: msg, npc: res.reply || '...' })
    rounds.value = res.rounds || rounds.value + 1
    // 达到轮次上限：追加系统提示（下次输入将被禁用）
    if (res.rounds >= MAX_DIALOG_ROUNDS) {
      history.value.push({ player: '', npc: '（当前对话轮数过长，请重新进行会话）' })
    }
  } catch (err) {
    history.value.push({ player: msg, npc: `（${err.message || '对方没有回应'}）` })
  } finally {
    loading.value = false
    await scrollBottom()
  }
}

/** 关闭 */
function close() {
  open.value = false
  npc.value = null
  sessionId.value = null
  playerId.value = null
  history.value = []
  input.value = ''
  rounds.value = 0
}

/** 点击快捷事件按钮（dialog_event）
 *  按 event 名查 dialogEventHandlers 回调库分发（一对一匹配），命中则执行 handler。
 *  handler 只做 UI/store 操作，DB 数据计算走后端接口。 */
function handleEventClick(evt) {
  if (!npc.value || !playerId.value) return
  dispatchDialogEvent(evt.event, {
    evt,
    npc: npc.value,
    playerId: playerId.value,
    closeDialog: close,
  })
}

/** ESC 关闭 */
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
  <Teleport to="body">
    <div
      v-if="open"
      class="npc-overlay"
    >
      <div class="npc-box">
        <!-- header：NPC 名 + 性别·年龄·职能·性格 + 关闭 -->
        <div class="npc-header">
          <span class="npc-name">{{ npc?.name || '???' }}</span>
          <span class="npc-info">
            {{ npc?.gender }} · {{ npc?.age }} · {{ npc?.role_name }} · {{ npc?.nature_name }}
          </span>
          <button
            class="npc-close"
            type="button"
            @click="close"
          >
            ×
          </button>
        </div>

        <!-- 快捷事件按钮（dialog_event：如「我想买卖些物品」触发交易） -->
        <div
          v-if="npc?.dialog_events?.length"
          class="npc-actions"
        >
          <button
            v-for="evt in npc.dialog_events"
            :key="evt.id"
            class="npc-action-btn"
            type="button"
            @click="handleEventClick(evt)"
          >
            {{ evt.text }}
          </button>
        </div>

        <!-- 对话区 -->
        <div
          ref="msgBox"
          class="npc-messages"
        >
          <div
            v-if="npc"
            class="msg-system"
          >
            你走向了{{ npc.name }}...
          </div>
          <div
            v-for="(msg, idx) in history"
            :key="idx"
            class="msg-pair"
          >
            <div
              v-if="msg.player"
              class="msg-player"
            >
              {{ msg.player }}
            </div>
            <div class="msg-npc">
              {{ msg.npc }}
            </div>
          </div>
          <div
            v-if="loading"
            class="msg-loading"
          >
            思考中...
          </div>
        </div>

        <!-- 输入区 -->
        <div
          class="npc-input"
          :class="{ 'is-limited': reachedLimit }"
        >
          <input
            v-model="input"
            :placeholder="reachedLimit ? '当前对话轮数过长，请重新进行会话' : '说点什么...'"
            :disabled="loading || reachedLimit"
            @keyup.enter="handleSend"
          >
          <button
            v-if="!reachedLimit"
            class="send-btn"
            type="button"
            :disabled="loading || !input.trim()"
            @click="handleSend"
          >
            发送
          </button>
          <span
            v-else
            class="round-limit-tip"
          >已达上限</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 全屏遮罩：锁定 1200px 设计区，与 BattlePanel/CharacterSelectDialog 对齐 */
.npc-overlay {
  position: fixed;
  width: 1200px;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 12, 0.75);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.npc-box {
  width: 800px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.96), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* header */
.npc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(10, 8, 6, 0.6);
  border-bottom: 1px solid rgba(180, 150, 90, 0.25);
}
.npc-name {
  color: #f0d890;
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.npc-info {
  flex: 1;
  color: rgba(200, 170, 110, 0.7);
  font-size: 0.78rem;
  letter-spacing: 1px;
}
.npc-close {
  background: none;
  border: 1px solid rgba(150, 120, 70, 0.4);
  color: rgba(200, 170, 110, 0.6);
  cursor: pointer;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  font-size: 1.2rem;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.npc-close:hover {
  color: #ff9080;
  border-color: rgba(255, 120, 100, 0.6);
  background: rgba(60, 20, 15, 0.5);
}

/* 快捷事件按钮区（dialog_event：交易/任务等入口） */
.npc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(180, 150, 90, 0.25);
  background: rgba(18, 14, 9, 0.5);
}
.npc-action-btn {
  padding: 6px 14px;
  background: linear-gradient(180deg, rgba(55, 42, 24, 0.85), rgba(38, 28, 18, 0.85));
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 4px;
  color: #e8d5a0;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-size: 0.85rem;
  letter-spacing: 1px;
  transition: all 0.15s ease;
}
.npc-action-btn:hover {
  border-color: rgba(220, 190, 120, 0.9);
  background: linear-gradient(180deg, rgba(70, 54, 30, 0.95), rgba(48, 36, 22, 0.95));
  box-shadow: 0 0 10px rgba(212, 175, 106, 0.25);
}

/* 对话区 */
.npc-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px;
  min-height: 400px;
  max-height: 70vh;
}
.npc-messages::-webkit-scrollbar {
  width: 4px;
}
.npc-messages::-webkit-scrollbar-thumb {
  background: rgba(180, 150, 90, 0.3);
  border-radius: 2px;
}
.msg-system {
  color: rgba(200, 170, 110, 0.45);
  font-style: italic;
  text-align: center;
  margin-bottom: 14px;
  font-size: 0.85rem;
}
.msg-pair {
  margin-bottom: 12px;
}
.msg-player {
  color: #80b0e0;
  margin-bottom: 5px;
  padding-left: 10px;
  border-left: 2px solid rgba(110, 160, 232, 0.5);
  line-height: 1.6;
}
.msg-npc {
  color: #d8d0bc;
  background: rgba(35, 28, 18, 0.6);
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 4px;
  line-height: 1.7;
  border: 1px solid rgba(180, 150, 90, 0.15);
}
.msg-loading {
  color: rgba(200, 170, 110, 0.5);
  font-style: italic;
  text-align: center;
  font-size: 0.85rem;
}

/* 输入区 */
.npc-input {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid rgba(180, 150, 90, 0.25);
  background: rgba(10, 8, 6, 0.5);
}
.npc-input input {
  flex: 1;
  padding: 8px 12px;
  background: rgba(20, 16, 10, 0.7);
  border: 1px solid rgba(150, 120, 70, 0.4);
  border-radius: 4px;
  color: #e8d5a0;
  font-size: 0.9rem;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  outline: none;
  transition: border-color 0.15s ease;
}
.npc-input input:focus {
  border-color: rgba(220, 190, 120, 0.7);
}
.npc-input input::placeholder {
  color: rgba(150, 120, 70, 0.5);
}
.send-btn {
  padding: 8px 18px;
  background: linear-gradient(180deg, rgba(60, 45, 26, 0.9), rgba(40, 30, 20, 0.9));
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 4px;
  color: #e8d5a0;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-size: 0.9rem;
  letter-spacing: 2px;
  transition: all 0.15s ease;
}
.send-btn:hover:not(:disabled) {
  border-color: rgba(220, 190, 120, 0.9);
  background: linear-gradient(180deg, rgba(75, 56, 32, 0.95), rgba(50, 38, 25, 0.95));
}
.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* 轮次上限提示（替换发送按钮位置） */
.round-limit-tip {
  flex-shrink: 0;
  padding: 8px 14px;
  font-size: 0.82rem;
  color: rgba(255, 144, 128, 0.75);
  letter-spacing: 1px;
  white-space: nowrap;
}
.npc-input.is-limited input {
  border-color: rgba(200, 90, 80, 0.4);
}
</style>
