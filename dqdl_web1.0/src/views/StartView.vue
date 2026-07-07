<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import LoginPanel from '../components/LoginPanel.vue'

const auth = useAuthStore()
const loading = ref(false)

/** 新游戏 */
async function onNewGame() {
  if (loading.value) return
  loading.value = true
  try {
    // TODO: 接入后端 createSave（创建一个新存档）
    alert('新游戏（存档创建待接入）')
  } finally {
    loading.value = false
  }
}

/** 继续游戏 */
async function onContinue() {
  if (loading.value) return
  loading.value = true
  try {
    const saves = await auth.fetchSaves()
    if (!saves.length) {
      alert('暂无存档，请新建游戏')
      return
    }
    // TODO: 进入游戏主界面（选定存档后）
    alert(`共 ${saves.length} 个存档，进入游戏（待接入）`)
  } finally {
    loading.value = false
  }
}

/** 退出登录 */
function onLogout() {
  auth.logout()
}
</script>

<template>
  <div class="start-page">
    <!-- 背景大图 -->
    <img
      class="bg"
      src="/ui/bg-continent.webp"
      alt=""
    >

    <!-- 标题 -->
    <h1 class="title">
      斗气大陆
    </h1>
    <p class="subtitle">
      踏破苍穹，逆天改命
    </p>

    <!-- 未登录：显示登录面板 -->
    <LoginPanel v-if="!auth.isLoggedIn" />

    <!-- 已登录：显示新游戏 / 继续游戏 -->
    <div
      v-else
      class="actions"
    >
      <button
        class="start-btn"
        :disabled="loading"
        @click="onNewGame"
      >
        <img
          class="btn-bg"
          src="/ui/btn-new.png"
          alt=""
        >
        <span class="btn-text">新游戏</span>
      </button>
      <button
        class="start-btn"
        :disabled="loading"
        @click="onContinue"
      >
        <img
          class="btn-bg"
          src="/ui/btn-continue.png"
          alt=""
        >
        <span class="btn-text">继续游戏</span>
      </button>

      <div class="user-bar">
        <span class="user-name">{{ auth.user?.username }}</span>
        <button
          class="logout-btn"
          @click="onLogout"
        >
          退出
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.start-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  filter: brightness(0.7);
}

.title {
  position: relative;
  z-index: 1;
  font-size: 72px;
  letter-spacing: 12px;
  margin: 0 0 8px;
  color: #e8d5a0;
  text-shadow: 0 0 20px rgba(0, 0, 0, 0.9), 0 4px 8px rgba(0, 0, 0, 0.7);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.subtitle {
  position: relative;
  z-index: 1;
  font-size: 18px;
  letter-spacing: 6px;
  margin: 0 0 60px;
  color: #b8a070;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.actions {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
}

.start-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 80px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
}

.start-btn .btn-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.start-btn .btn-text {
  position: relative;
  z-index: 1;
  font-size: 24px;
  letter-spacing: 8px;
  color: #f0e0b0;
  text-shadow: 0 0 8px rgba(0, 0, 0, 0.9), 0 2px 4px rgba(0, 0, 0, 0.8);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  pointer-events: none;
}

.start-btn:hover:not(:disabled) {
  transform: scale(1.05);
  filter: brightness(1.15) drop-shadow(0 0 12px rgba(232, 213, 160, 0.5));
}

.start-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.start-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 用户信息条（登录后显示在按钮下方） */
.user-bar {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  color: rgba(200, 180, 140, 0.7);
  letter-spacing: 1px;
}

.user-name {
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.logout-btn {
  padding: 2px 10px;
  font-size: 12px;
  color: rgba(200, 180, 140, 0.7);
  background: transparent;
  border: 1px solid rgba(180, 150, 90, 0.3);
  border-radius: 3px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.logout-btn:hover {
  color: #e8d5a0;
  border-color: rgba(212, 175, 106, 0.6);
}
</style>
