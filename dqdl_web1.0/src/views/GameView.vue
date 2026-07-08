<script setup>
/**
 * 游戏主界面：左上角玩家信息 + 右下角功能图标栏。
 * 背景使用 bg-continent.webp。当前为纯 UI，数据用 mock 占位，后续接入玩家实时数据。
 */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import PlayerInfo from '../components/PlayerInfo.vue'
import IconToolbar from '../components/IconToolbar.vue'

const router = useRouter()

// TODO: 接入后端 player 数据（通过 query 中的 characterId 拉取或全局 store）
const player = ref({
  name: '无名',
  level: 1,
  hp: 100,
  maxHp: 100,
  energy: 50,
  maxEnergy: 100,
})

/** 功能图标点击：暂时只记录，后续按 key 打开对应面板 */
function onIconSelect(key) {
  console.log('选中功能：', key)
}

/** 返回开始页（退出当前角色，不做登出） */
function backToStart() {
  router.push({ name: 'start' })
}
</script>

<template>
  <div class="game-view">
    <!-- 背景 -->
    <img
      class="bg"
      src="/ui/bg-continent.webp"
      alt=""
    >

    <!-- 左上角玩家信息 -->
    <PlayerInfo
      :name="player.name"
      :level="player.level"
      :hp="player.hp"
      :max-hp="player.maxHp"
      :energy="player.energy"
      :max-energy="player.maxEnergy"
    />

    <!-- 右上角返回按钮 -->
    <button
      class="back-btn"
      type="button"
      @click="backToStart"
    >
      返回
    </button>

    <!-- 右下角功能图标栏 -->
    <IconToolbar @select="onIconSelect" />
  </div>
</template>

<style scoped>
.game-view {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #0a0806;
}

.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}

.back-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  padding: 6px 16px;
  font-size: 13px;
  letter-spacing: 2px;
  color: #e8d5a0;
  background: rgba(10, 8, 6, 0.55);
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 4px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  transition: all 0.2s ease;
}

.back-btn:hover {
  background: rgba(180, 150, 90, 0.2);
  border-color: rgba(220, 190, 120, 0.7);
}
</style>
