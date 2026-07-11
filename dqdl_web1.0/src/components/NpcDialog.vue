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
import { ref, nextTick, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { createNpcSession, talkInSession } from '../api'

const open = ref(false)
const npc = ref(null)        // NPC 详情（含 name/gender/age/role_name/nature_name）
const sessionId = ref(null)  // server 会话 id（记忆权威源）
const history = ref([])      // [{ player, npc }] 仅渲染用，权威在 server
const loading = ref(false)
const input = ref('')

const msgBox = ref(null)

/** 自动滚到底 */
async function scrollBottom() {
  await nextTick()
  const el = msgBox.value
  if (el) el.scrollTop = el.scrollHeight
}

/** 打开对话：{ playerId, npcId } → 建会话 → 取开场白 */
async function handleOpen({ playerId, npcId }) {
  open.value = true
  npc.value = null
  sessionId.value = null
  history.value = []
  input.value = ''
  loading.value = true
  try {
    // 1. 创建会话（server 建 dialog_session，返回 sessionId + npc 详情）
    const sessionRes = await createNpcSession(npcId, playerId)
    sessionId.value = sessionRes.sessionId
    npc.value = sessionRes.npc
    // 2. 取 AI 开场白（message 为空 → agent 生成开场白）
    const res = await talkInSession(sessionId.value, '')
    history.value.push({ player: '', npc: res.reply || '...' })
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
  if (!msg || loading.value || !sessionId.value) return
  input.value = ''
  loading.value = true
  try {
    const res = await talkInSession(sessionId.value, msg)
    history.value.push({ player: msg, npc: res.reply || '...' })
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
  history.value = []
  input.value = ''
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
        <div class="npc-input">
          <input
            v-model="input"
            placeholder="说点什么..."
            :disabled="loading"
            @keyup.enter="handleSend"
          >
          <button
            class="send-btn"
            type="button"
            :disabled="loading || !input.trim()"
            @click="handleSend"
          >
            发送
          </button>
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
</style>
