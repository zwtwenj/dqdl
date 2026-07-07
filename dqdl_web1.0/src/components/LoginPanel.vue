<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

/** 登录：成功后父组件通过 isLoggedIn 响应切换内容 */
async function onLogin() {
  if (loading.value) return
  if (!username.value || !password.value) {
    error.value = '请输入账号和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value.trim(), password.value)
  } catch (err) {
    error.value = err.response?.data?.message || '账号或密码错误'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-panel">
    <div class="auth-card">
      <h2 class="auth-title">· 登 录 ·</h2>

      <div class="field">
        <label class="field-label">账号</label>
        <input
          v-model="username"
          class="field-input"
          type="text"
          placeholder="请输入账号"
          maxlength="32"
          @keyup.enter="onLogin"
        />
      </div>

      <div class="field">
        <label class="field-label">密码</label>
        <input
          v-model="password"
          class="field-input"
          type="password"
          placeholder="请输入密码"
          @keyup.enter="onLogin"
        />
      </div>

      <p v-if="error" class="auth-error">{{ error }}</p>

      <!-- 登录按钮：复用"继续游戏"按钮图片风格 -->
      <button class="login-btn" :disabled="loading" @click="onLogin">
        <img class="btn-bg" src="/ui/btn-continue.png" alt="" />
        <span class="btn-text">{{ loading ? '登录中…' : '登录' }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.auth-panel {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
}

.auth-card {
  width: 360px;
  padding: 32px 36px 28px;
  background: rgba(15, 12, 8, 0.75);
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 6px;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(200, 170, 110, 0.15);
}

.auth-title {
  text-align: center;
  font-size: 22px;
  letter-spacing: 8px;
  margin: 0 0 24px;
  color: var(--gold-bright, #e8d5a0);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-weight: normal;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

.field {
  margin-bottom: 18px;
}

.field-label {
  display: block;
  font-size: 13px;
  color: var(--gold, #b8a070);
  margin-bottom: 6px;
  letter-spacing: 2px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* 古朴风格输入框：半透明深色底 + 金色细边 + 暗金文字 */
.field-input {
  width: 100%;
  height: 40px;
  padding: 0 12px;
  background: rgba(30, 24, 16, 0.8);
  border: 1px solid rgba(150, 120, 70, 0.5);
  border-radius: 4px;
  color: var(--gold-bright, #e8d5a0);
  font-size: 15px;
  letter-spacing: 1px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.field-input::placeholder {
  color: rgba(150, 130, 90, 0.5);
}

.field-input:focus {
  border-color: rgba(212, 175, 106, 0.8);
  box-shadow: 0 0 8px rgba(212, 175, 106, 0.25);
}

.auth-error {
  margin: 0 0 14px;
  font-size: 13px;
  color: #e0704a;
  text-align: center;
  min-height: 18px;
  letter-spacing: 1px;
}

/* 登录按钮：与"继续游戏"按钮同样结构（图片底 + 文字叠加） */
.login-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 200px;
  height: 72px;
  margin: 8px auto 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
}

.login-btn .btn-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.login-btn .btn-text {
  position: relative;
  z-index: 1;
  font-size: 22px;
  letter-spacing: 6px;
  color: #f0e0b0;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.9), 0 2px 4px rgba(0, 0, 0, 0.8);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  pointer-events: none;
}

.login-btn:hover:not(:disabled) {
  transform: scale(1.05);
  filter: brightness(1.15) drop-shadow(0 0 12px rgba(232, 213, 160, 0.5));
}

.login-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
