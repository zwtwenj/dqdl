<script setup>
import { ref, watch } from 'vue'

/**
 * 创建角色弹窗：输入玩家姓名，确定后开始新游戏。
 * 姓名 → 后端 player.name 字段。
 *
 * Props:
 *   modelValue (boolean) - 是否显示
 * Emits:
 *   update:modelValue - 关闭
 *   confirm (name)    - 确认姓名
 */
const props = defineProps({
  modelValue: Boolean,
})
const emit = defineEmits(['update:modelValue', 'confirm'])

const name = ref('')
const error = ref('')

// 弹窗打开时重置
watch(() => props.modelValue, (v) => {
  if (v) {
    name.value = ''
    error.value = ''
  }
})

function onConfirm() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = '请输入角色名'
    return
  }
  if (trimmed.length > 32) {
    error.value = '角色名最多 32 个字符'
    return
  }
  emit('confirm', trimmed)
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="cp-overlay"
      @click.self="close"
    >
      <div class="cp-modal">
        <h2 class="cp-title">
          · 命 名 ·
        </h2>
        <p class="cp-desc">
          道友，请留下你的名号
        </p>

        <input
          ref="nameInput"
          v-model="name"
          class="cp-input"
          type="text"
          placeholder="输入角色名"
          maxlength="32"
          @keyup.enter="onConfirm"
        >

        <p
          v-if="error"
          class="cp-error"
        >
          {{ error }}
        </p>

        <div class="cp-actions">
          <button
            class="cp-btn cp-cancel"
            @click="close"
          >
            取消
          </button>
          <button
            class="cp-btn cp-ok"
            @click="onConfirm"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cp-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.cp-modal {
  width: 380px;
  padding: 36px 36px 28px;
  background: rgba(18, 14, 10, 0.92);
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(200, 170, 110, 0.15);
  text-align: center;
}

.cp-title {
  font-size: 22px;
  letter-spacing: 8px;
  margin: 0 0 8px;
  color: #e8d5a0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-weight: normal;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

.cp-desc {
  font-size: 13px;
  color: rgba(200, 180, 140, 0.6);
  letter-spacing: 2px;
  margin: 0 0 24px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.cp-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  background: rgba(30, 24, 16, 0.8);
  border: 1px solid rgba(150, 120, 70, 0.5);
  border-radius: 4px;
  color: #e8d5a0;
  font-size: 16px;
  letter-spacing: 2px;
  text-align: center;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.cp-input::placeholder {
  color: rgba(150, 130, 90, 0.4);
  letter-spacing: 1px;
}

.cp-input:focus {
  border-color: rgba(212, 175, 106, 0.8);
  box-shadow: 0 0 8px rgba(212, 175, 106, 0.25);
}

.cp-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: #e0704a;
  min-height: 18px;
  letter-spacing: 1px;
}

.cp-actions {
  margin-top: 24px;
  display: flex;
  gap: 16px;
  justify-content: center;
}

.cp-btn {
  padding: 8px 28px;
  font-size: 15px;
  letter-spacing: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.cp-cancel {
  color: rgba(200, 180, 140, 0.6);
  background: transparent;
  border: 1px solid rgba(180, 150, 90, 0.3);
}

.cp-cancel:hover {
  color: #e8d5a0;
  border-color: rgba(212, 175, 106, 0.5);
}

.cp-ok {
  color: #1a1408;
  background: linear-gradient(180deg, #e8d5a0, #c8a868);
  border: 1px solid #d4af6a;
}

.cp-ok:hover {
  filter: brightness(1.1);
  box-shadow: 0 0 12px rgba(232, 213, 160, 0.4);
}
</style>
