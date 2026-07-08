<script setup>
/**
 * 全局消息提示组件（toast）。
 * 监听事件总线 BusEvents.TOAST，收到后顶部居中弹出消息，自动消失。
 * 在 App.vue 中挂载一次即可全局可用。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'

const toasts = ref([])
let uid = 0

function showToast({ type = 'info', message = '', duration = 2500 }) {
  const id = ++uid
  toasts.value.push({ id, type, message })
  setTimeout(() => {
    removeToast(id)
  }, duration)
}

function removeToast(id) {
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx >= 0) toasts.value.splice(idx, 1)
}

let off = null
onMounted(() => {
  off = bus.on(BusEvents.TOAST, showToast)
})
onUnmounted(() => {
  off && off()
})
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <transition-group name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="t.type"
          @click="removeToast(t.id)"
        >
          {{ t.message }}
        </div>
      </transition-group>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.toast {
  padding: 10px 24px;
  font-size: 14px;
  letter-spacing: 1px;
  border-radius: 6px;
  border: 1px solid;
  backdrop-filter: blur(6px);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
  pointer-events: auto;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.toast.info {
  color: #e8d5a0;
  background: rgba(30, 24, 16, 0.92);
  border-color: rgba(180, 150, 90, 0.5);
}

.toast.success {
  color: #a0e8a0;
  background: rgba(20, 36, 22, 0.92);
  border-color: rgba(90, 180, 90, 0.5);
}

.toast.error {
  color: #ff9080;
  background: rgba(40, 18, 18, 0.92);
  border-color: rgba(200, 80, 70, 0.6);
}

/* 过渡动画 */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
