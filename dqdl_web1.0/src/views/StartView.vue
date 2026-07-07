<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '../stores/game'

const router = useRouter()
const game = useGameStore()

const loading = ref(false)

/** 新游戏 */
async function onNewGame() {
  if (loading.value) return
  loading.value = true
  try {
    // TODO: 接入后端 createPlayer（重构后端就绪前先占位）
    // const { createPlayer } = await import('../api')
    // const res = await createPlayer({ name: '萧炎' })
    // game.playerId = res.data.id
    await new Promise((r) => setTimeout(r, 200))
    // router.push({ name: 'game' })
    alert('新游戏（后端未接入）')
  } finally {
    loading.value = false
  }
}

/** 继续游戏 */
async function onContinue() {
  if (loading.value) return
  loading.value = true
  try {
    const hasSave = game.hasSave
    if (!hasSave) {
      alert('暂无存档')
      return
    }
    // TODO: 接入后端 getPlayer + continueGame
    // router.push({ name: 'game' })
    alert('继续游戏（后端未接入）')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="start-page">
    <!-- 背景大图 -->
    <img class="bg" src="/ui/bg-continent.webp" alt="" />

    <!-- 标题 -->
    <h1 class="title">斗气大陆</h1>
    <p class="subtitle">踏破苍穹，逆天改命</p>

    <!-- 按钮组 -->
    <div class="actions">
      <button class="start-btn" :disabled="loading" @click="onNewGame">
        <img class="btn-bg" src="/ui/btn-new.png" alt="" />
        <span class="btn-text">新游戏</span>
      </button>
      <button class="start-btn" :disabled="loading" @click="onContinue">
        <img class="btn-bg" src="/ui/btn-continue.png" alt="" />
        <span class="btn-text">继续游戏</span>
      </button>
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
  /* 背景图轻微暗化，让前景文字更清晰 */
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
</style>
