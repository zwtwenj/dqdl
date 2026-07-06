<template>
  <div class="re-overlay" v-if="current" :style="{ zIndex: store.overlayZ }">
    <div class="re-box" @click.stop>
      <!-- 头部：标题 + 关闭 -->
      <div class="re-header">
        <span class="re-glyph">✦</span>
        <span class="re-title">{{ current.title }}</span>
        <button class="re-close" @click="store.close">×</button>
      </div>

      <!-- 对话区：NPC 台词在上 -->
      <div class="re-messages" ref="msgBox">
        <div
          v-for="(msg, idx) in store.messages"
          :key="idx"
          class="re-msg"
          :class="msg.from === 'player' ? 're-msg-player' : 're-msg-npc'"
        >
          <span class="re-msg-name" v-if="msg.from === 'npc'">神秘人</span>
          <span class="re-msg-text">{{ msg.text }}</span>
        </div>
        <div class="re-thinking" v-if="store.busy">...</div>
      </div>

      <!-- 选项区：玩家选项在下 -->
      <div class="re-choices">
        <template v-if="store.ended">
          <button class="re-choice re-choice-end" @click="store.close">确 定</button>
        </template>
        <template v-else-if="store.choices.length">
          <button
            v-for="(choice, idx) in store.choices"
            :key="idx"
            class="re-choice"
            :class="{ 'is-disabled': !store.canPick(choice).ok }"
            :disabled="!store.canPick(choice).ok || store.busy"
            @click="store.pickChoice(choice)"
          >
            <span class="re-choice-num">{{ idx + 1 }}.</span>
            <span class="re-choice-text">{{ choice.text }}</span>
            <span class="re-choice-hint" v-if="!store.canPick(choice).ok">
              （{{ store.canPick(choice).reason }}）
            </span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useRandomEventStore } from '../stores/randomEvent'

const store = useRandomEventStore()
const { current } = storeToRefs(store)

const msgBox = ref(null)
watch(
  () => store.messages.length,
  async () => {
    await nextTick()
    if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight
  },
)
</script>

<style scoped>
.re-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(5, 5, 12, 0.78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.re-box {
  width: 480px;
  max-width: 92vw;
  max-height: 82vh;
  background: var(--bg-elev-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text);
}
.re-header {
  padding: 10px 16px;
  background: #0d0d1a;
  border-bottom: 1px solid #1a1a3e;
  display: flex;
  align-items: center;
  gap: 8px;
}
.re-glyph { color: var(--gold); }
.re-title {
  flex: 1;
  color: var(--gold);
  font-weight: bold;
  letter-spacing: 1px;
}
.re-close {
  background: none;
  border: 1px solid #3a3a5a;
  color: #7a7a9a;
  cursor: pointer;
  padding: 0 8px;
  border-radius: 4px;
  font-size: 1rem;
  line-height: 1.4;
}
.re-close:hover { background: #2a2a3e; color: var(--text); }

.re-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  min-height: 160px;
  max-height: 46vh;
}
.re-msg { margin-bottom: 14px; }
.re-msg-npc .re-msg-name {
  display: block;
  color: var(--gold);
  font-size: 0.82rem;
  margin-bottom: 4px;
  opacity: 0.85;
}
.re-msg-npc .re-msg-text {
  display: block;
  color: var(--text);
  line-height: 1.8;
  white-space: pre-wrap;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-left: 2px solid var(--gold);
  border-radius: 0 6px 6px 0;
}
.re-msg-player .re-msg-text {
  display: block;
  color: #7a9ec2;
  line-height: 1.7;
  padding-left: 10px;
  border-left: 2px solid #3a5a7a;
}
.re-thinking { color: #5a5a7a; text-align: center; }

.re-choices {
  padding: 12px 16px 16px;
  border-top: 1px solid #1a1a3e;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.re-choice {
  width: 100%;
  text-align: left;
  padding: 10px 14px;
  font-size: 0.92rem;
  color: var(--text);
  background: rgba(60, 60, 90, 0.18);
  border: 1px solid #2e2e48;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}
.re-choice:hover:not(:disabled) {
  background: rgba(80, 80, 120, 0.3);
  border-color: var(--gold);
  color: var(--gold);
}
.re-choice.is-disabled { opacity: 0.45; cursor: not-allowed; }
.re-choice-num { color: var(--gold); margin-right: 6px; }
.re-choice-hint { color: #b06258; font-size: 0.82rem; margin-left: 4px; }
.re-choice-end {
  text-align: center;
  letter-spacing: 4px;
  color: var(--gold);
  border-color: var(--gold);
}
</style>
