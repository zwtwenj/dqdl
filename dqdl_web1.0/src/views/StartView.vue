<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import LoginPanel from '../components/LoginPanel.vue'
import SaveSelectDialog from '../components/SaveSelectDialog.vue'

const auth = useAuthStore()
const loading = ref(false)

/** 存档选择弹窗状态 */
const saveDialogVisible = ref(false)
const saveDialogMode = ref('new')  // 'new' | 'continue'

/** 新游戏：弹出存档选择（仅显示空槽位） */
function onNewGame() {
  if (loading.value) return
  saveDialogMode.value = 'new'
  saveDialogVisible.value = true
}

/** 继续游戏：弹出存档选择（仅显示已有存档） */
function onContinue() {
  if (loading.value) return
  if (!auth.saves.length) {
    alert('暂无存档，请新建游戏')
    return
  }
  saveDialogMode.value = 'continue'
  saveDialogVisible.value = true
}

/** 存档选择确认：进入游戏（待接入） */
function onSaveSelect(slot) {
  saveDialogVisible.value = false
  // TODO: 进入游戏主界面（加载/创建指定 slot 的存档）
  alert(`选中存档槽位 ${slot}（进入游戏待接入）`)
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

    <!-- 右上角：用户名 + 退出按钮（登录后显示） -->
    <div
      v-if="auth.isLoggedIn"
      class="top-right"
    >
      <span class="user-name">{{ auth.user?.username }}</span>
      <button
        class="logout-btn"
        @click="onLogout"
      >
        <img
          class="logout-bg"
          src="/ui/loginout.png"
          alt=""
        >
        <span class="logout-text">退出</span>
      </button>
    </div>

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
    </div>

    <!-- 存档选择弹窗 -->
    <SaveSelectDialog
      v-model="saveDialogVisible"
      :saves="auth.saves"
      :mode="saveDialogMode"
      @select="onSaveSelect"
    />
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

/* 副标题改色：偏冷的青金色，区别于主标题的暖金色 */
.subtitle {
  position: relative;
  z-index: 1;
  font-size: 18px;
  letter-spacing: 6px;
  margin: 0 0 60px;
  color: #7ec8b0;
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

/* 右上角用户信息区 */
.top-right {
  position: absolute;
  top: 24px;
  right: 32px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 玩家名字：浅青金色，区别于按钮金色 */
.user-name {
  font-size: 15px;
  letter-spacing: 2px;
  color: #6ab8a0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

/* 退出按钮：图片底 + 文字叠加 */
.logout-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
}

.logout-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}

.logout-text {
  position: relative;
  z-index: 1;
  font-size: 13px;
  letter-spacing: 2px;
  color: #f0e0b0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  pointer-events: none;
}

.logout-btn:hover {
  transform: scale(1.05);
  filter: brightness(1.15);
}
</style>
