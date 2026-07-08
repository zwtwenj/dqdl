<script setup>
/**
 * 游戏主界面：左上角玩家信息 + 右下角功能图标栏 + 中央当前地图。
 * 进入页面时按 query.playerId 从后端拉取玩家信息（含 final_attrs）。
 */
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlayerInfo from '../components/PlayerInfo.vue'
import IconToolbar from '../components/IconToolbar.vue'
import CurrentMap from '../components/CurrentMap.vue'
import NeighborMapDrawer from '../components/NeighborMapDrawer.vue'
import ChildrenMapDrawer from '../components/ChildrenMapDrawer.vue'
import { getPlayer } from '../api'

const route = useRoute()
const router = useRouter()

// 玩家信息（由后端 findOne 聚合返回，含 final_attrs）
const player = ref(null)
const loading = ref(true)
const errorMsg = ref('')

/** 拉取玩家完整信息 */
async function loadPlayer() {
  const playerId = Number(route.query.playerId)
  if (!playerId) {
    errorMsg.value = '缺少 playerId，请重新进入游戏'
    loading.value = false
    return
  }
  try {
    const data = await getPlayer(playerId)
    player.value = data
  } catch (err) {
    errorMsg.value = err.message || '加载玩家信息失败'
  } finally {
    loading.value = false
  }
}

onMounted(loadPlayer)

/** 功能图标点击：暂时只记录，后续按 key 打开对应面板 */
function onIconSelect(key) {
  console.log('选中功能：', key)
}

/** 同级地图卡片点击：切换当前地点（后续接 location 切换逻辑） */
function onNeighborSelect(item) {
  console.log('切换到邻近地点：', item.name, item.id)
}

/** 子级地图卡片点击：进入子地点（后续接 location 切换逻辑） */
function onChildrenSelect(item) {
  console.log('进入子级地点：', item.name, item.id)
}

/** 返回开始页（退出当前角色，不做登出） */
function backToStart() {
  router.push({ name: 'start' })
}
</script>

<template>
  <div class="game-view">
    <!-- 背景：fixed 定位，不受子容器 overflow/层叠上下文影响 -->
    <img
      class="bg"
      src="/ui/bg-continent.webp"
      alt=""
    >

    <!-- 左上角玩家信息 -->
    <PlayerInfo
      v-if="player"
      :name="player.name"
      :level="player.level"
      :level-name="player.level_name"
      :hp="player.hp"
      :max-hp="player.final_attrs?.max_hp ?? player.max_hp"
      :energy="player.energy"
      :max-energy="player.final_attrs?.max_energy ?? player.max_energy"
    />

    <!-- 加载/错误提示 -->
    <div
      v-if="loading"
      class="overlay-tip"
    >
      加载中...
    </div>
    <div
      v-else-if="errorMsg"
      class="overlay-tip error"
    >
      {{ errorMsg }}
      <button
        class="retry-btn"
        type="button"
        @click="backToStart"
      >
        返回开始页
      </button>
    </div>

    <div class="game-container">
      <div class="game-map">
        <!-- 中央当前地图面板 -->
        <CurrentMap
          v-if="player"
          class="current-map"
        />
        <!-- 左侧地图抽屉：邻近之地 + 可达之所 -->
        <div class="map-drawers">
          <NeighborMapDrawer
            class="drawer-item"
            @select="onNeighborSelect"
          />
          <ChildrenMapDrawer
            class="drawer-item"
            @select="onChildrenSelect"
          />
        </div>
      </div>
      <div class="game-logs">
        <!-- 采集/历练面板：后续接 socket -->
      </div>
    </div>

    <!-- 右上角返回开始页按钮 -->
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

<style lang="less" scoped>
.game-view {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  background: #0a0806;
}

/* 背景：fixed 定位，脱离文档流且不参与子容器层叠合成，全屏统一渲染 */
.bg {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  pointer-events: none;
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

.game-container{
  margin-top: 90px;
  height: calc(100vh - 180px);
  display: flex;
  width: 100%;
  padding: 0 10px;
  .game-map{
    width: 860px;
    overflow-y: auto;
    height: 100%;
  }
  .game-logs{
    flex: 1;
    height: 100%;
  }
}

.current-map{
  width: 100%;
  border-radius: 10px;
  padding: 15px;
}

/* 左侧地图抽屉容器：邻近之地 + 可达之所 纵向排列 */
.map-drawers {
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-top: 10px;
}

.drawer-item {
  /* 由 MapDrawer 内部决定宽度，这里不限制 */
}

.overlay-tip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  color: #e8d5a0;
  letter-spacing: 2px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
}

.overlay-tip.error {
  color: #ff9080;
}

.retry-btn {
  padding: 6px 18px;
  font-size: 13px;
  letter-spacing: 2px;
  color: #e8d5a0;
  background: rgba(10, 8, 6, 0.6);
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 4px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.retry-btn:hover {
  background: rgba(180, 150, 90, 0.2);
  border-color: rgba(220, 190, 120, 0.8);
}
</style>
