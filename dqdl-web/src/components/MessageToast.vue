<template>
  <Teleport to="body">
    <TransitionGroup tag="div" name="msg" class="msg-wrap">
      <div
        v-for="m in messagesRef"
        :key="m.id"
        class="msg"
        :class="'msg--' + m.type"
        @click="Message.remove(m.id)"
      >
        <span class="msg__icon">{{ icon(m.type) }}</span>
        <span class="msg__text">{{ m.text }}</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup>
import { messagesRef, Message } from '../utils/message'

const ICONS = { info: '✦', success: '✓', warning: '!', error: '✕' }
function icon(t) {
  return ICONS[t] || '✦'
}
</script>

<style scoped>
/* 顶部居中堆叠，脱离任意裁切容器，层级高于所有弹框/悬浮 */
.msg-wrap {
  position: fixed;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}
.msg {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 220px;
  max-width: min(80vw, 460px);
  padding: 10px 16px;
  background: var(--bg-elev-1);
  border: 1px solid var(--border-strong);
  border-left-width: 4px;
  border-radius: var(--radius);
  box-shadow: var(--shadow-panel);
  color: var(--text);
  font-size: 0.9rem;
  line-height: 1.4;
  cursor: pointer;
  white-space: pre-wrap;
}
.msg__icon {
  font-weight: 700;
  flex-shrink: 0;
}
.msg__text {
  flex: 1;
}

.msg--info { border-left-color: var(--purple); }
.msg--info .msg__icon { color: var(--purple); }
.msg--success { border-left-color: var(--green); }
.msg--success .msg__icon { color: var(--green); }
.msg--warning { border-left-color: var(--orange); }
.msg--warning .msg__icon { color: var(--orange); }
.msg--error { border-left-color: var(--danger); }
.msg--error .msg__icon { color: var(--danger); }

.msg-enter-active { transition: all 0.3s ease; }
.msg-leave-active { transition: all 0.25s ease; }
.msg-enter-from { opacity: 0; transform: translateY(-14px); }
.msg-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }
</style>
