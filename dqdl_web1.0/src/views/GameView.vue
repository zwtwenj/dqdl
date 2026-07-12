<script setup>
/**
 * 游戏主界面：左上角玩家信息 + 右下角功能图标栏 + 中央当前地图。
 *
 * 地图系统：location_net（网状平面地图，对角邻接）+ location_scene（城内场景）。
 *  - 玩家位置由后端 player.location_id / scene_id 维护，进页面时由 loadPlayer 拉取。
 *  - 「当前地图」= 视野 ring0（玩家所在节点），「邻近之地」= ring1 对角邻居。
 *  - 移动到 ring1 邻居 = 探索（后端自动补齐新位置的 ring1）。
 *  - 城市地点显示「场景」面板（坊市/佣兵工会/炼药师公会），可进/退场景。
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlayerInfo from '../components/PlayerInfo.vue'
import IconToolbar from '../components/IconToolbar.vue'
import BagPanel from '../components/BagPanel.vue'
import PlayerPanel from '../components/PlayerPanel.vue'
import SkillPanel from '../components/SkillPanel.vue'
import BattlePanel from '../components/BattlePanel.vue'
import CurrentMap from '../components/CurrentMap.vue'
import MapDrawer from '../components/MapDrawer.vue'
import AdventureLog from '../components/AdventureLog.vue'
import CollectLog from '../components/CollectLog.vue'
import {
  getPlayer,
  startTraining,
  stopTraining,
  getActiveTraining,
  startBattle,
  battleAction,
  getBattleState,
  getNpcsByLocation,
} from '../api'
import {
  getPlayerView,
  moveToNet,
  getMapScenes,
  enterScene,
  exitScene,
} from '../api/mapdemo'
import { bus, BusEvents } from '../utils/eventBus'
import { useBackpackStore } from '../stores/backpack'

const route = useRoute()
const router = useRouter()
const backpackStore = useBackpackStore()

// 玩家信息（由后端 findOne 聚合返回，含 final_attrs）
const player = ref(null)
const loading = ref(true)
const errorMsg = ref('')

// 历练日志 / 采集日志 收起状态（互斥：一个展开另一个收起）
const logCollapsed = ref(false)
const collectCollapsed = ref(true)

// 背包弹窗显隐
const bagOpen = ref(false)

// 角色面板显隐
const playerPanelOpen = ref(false)

// 斗技弹窗显隐
const skillPanelOpen = ref(false)

// 战斗界面
const battleOpen = ref(false)
const battleSnapshot = ref(null)
const battleBusy = ref(false)

// 弹窗拖拽位置（null = 沿用默认右下定位；拖动后转为 {x,y}）
const bagPos = ref(null)
const playerPos = ref(null)
const skillPos = ref(null)

// 历练日志数据 + 轮询定时器
const trainingLogs = ref([])
const lastSeenLogId = ref(0) // 上次轮询看到的最新日志 id（用于判断新日志有无掉落）
let trainingPollTimer = null

// ===== 地图系统状态（location_net） =====
// 视野：ring0（当前节点）+ ring1（对角邻居）+ fog（迷雾，仅展示）
const view = ref(null) // getPlayerView 返回 { ring0, ring1, nodes, edges, fog }
// 当前节点的场景列表（仅城市有）
const scenes = ref([])
// 玩家是否在场景内（player.scene_id 非 null）
const inScene = ref(null) // 当前所在场景对象 {id,name,scene_type} 或 null
// 地图移动中（等后端生成节点/拉视野，期间显示遮罩阻断重复点击）
const mapMoving = ref(false)

/** 开始历练 */
async function onStartTraining() {
  try {
    await startTraining()
    if (player.value) player.value.status = 2
    // 立即拉一次 + 启动轮询
    await pollTrainingLogs()
    startTrainingPoll()
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '开始历练失败' })
  }
}

/** 停止历练 */
async function onStopTraining() {
  try {
    await stopTraining()
    stopTrainingPoll()
    trainingLogs.value = []
    if (player.value) player.value.status = 1
    bus.emit(BusEvents.TOAST, { type: 'info', message: '历练已停止' })
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '停止历练失败' })
  }
}

/** 拉取当前历练日志 */
async function pollTrainingLogs() {
  try {
    const data = await getActiveTraining()
    if (data) {
      const newLogs = data.logs || []
      // 如果新日志中有掉落（drops 非空），标记背包脏（下次打开静默刷新）
      if (!backpackStore.dirty) {
        const hasNewDrops = newLogs.some(
          (l) => l.drops && l.drops !== 'null' && l.id > (lastSeenLogId.value || 0)
        )
        if (hasNewDrops) backpackStore.markDirty()
      }
      if (newLogs.length) lastSeenLogId.value = newLogs[0].id // logs 按 id DESC，第一个是最新
      trainingLogs.value = newLogs
      // 后端可能已自动结束（到时间），同步状态
      if (data.status === 1 && player.value?.status === 2) {
        player.value.status = 1
        stopTrainingPoll()
        bus.emit(BusEvents.TOAST, { type: 'info', message: '历练已结束' })
      }
    } else if (player.value?.status === 2) {
      // 后端已结束，前端同步
      player.value.status = 1
      stopTrainingPoll()
    }
  } catch (err) {
    console.warn('拉取历练日志失败:', err.message)
  }
}

/** 启动轮询（每 5 秒） */
function startTrainingPoll() {
  stopTrainingPoll()
  trainingPollTimer = setInterval(pollTrainingLogs, 5000)
}

/** 停止轮询 */
function stopTrainingPoll() {
  if (trainingPollTimer) {
    clearInterval(trainingPollTimer)
    trainingPollTimer = null
  }
}

// 进入页面时检查是否在历练中（刷新恢复）
async function checkActiveTraining() {
  if (player.value?.status === 2) {
    await pollTrainingLogs()
    startTrainingPoll()
  }
}

/** 刷新恢复战斗：status=7(战斗中) 时调 getBattleState 尝试接回会话 */
async function checkActiveBattle() {
  if (player.value?.status !== 7) return
  try {
    const snap = await getBattleState()
    if (snap) {
      // 会话还在（含已结束态）→ 打开战斗界面接回
      battleSnapshot.value = snap
      battleOpen.value = true
    } else {
      // 会话已丢失（后端重启），后端已自动恢复 IDLE → 同步前端 status
      if (player.value) player.value.status = 1
    }
  } catch (err) {
    console.warn('恢复战斗状态失败:', err.message)
  }
}

onUnmounted(stopTrainingPoll)

// 互斥：历练展开时收起采集，采集展开时收起历练
watch(logCollapsed, (v) => {
  if (!v) collectCollapsed.value = true
})
watch(collectCollapsed, (v) => {
  if (!v) logCollapsed.value = true
})

/** 拉取玩家完整信息，初始化地图视野 */
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
    // 预加载背包到内存（之后打开背包直接读 store，不请求）
    backpackStore.reset()
    await backpackStore.load(playerId)
    // 拉取地图视野 + 场景
    await loadView()
    // 检查是否在历练中（刷新恢复轮询）
    await checkActiveTraining()
    // 检查是否在战斗中（刷新恢复战斗界面 / 清理孤儿状态）
    await checkActiveBattle()
  } catch (err) {
    errorMsg.value = err.message || '加载玩家信息失败'
  } finally {
    loading.value = false
  }
}

/** 拉取玩家地图视野（ring0 当前节点 + ring1 对角邻居） */
async function loadView() {
  try {
    const data = await getPlayerView()
    view.value = data
    // 拉当前节点的场景列表
    if (data.ring0) {
      scenes.value = await getMapScenes(data.ring0.id)
    }
    // 同步 inScene 状态（从 player.scene_id 推导）
    syncInScene()
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '加载地图失败' })
  }
}

/** 根据 player.scene_id 同步当前场景对象 */
function syncInScene() {
  if (!player.value || player.value.scene_id == null) {
    inScene.value = null
    return
  }
  inScene.value = scenes.value.find((s) => s.id === player.value.scene_id) || null
}

/** 当前节点（ring0），作为 CurrentMap 的 location prop */
const currentLocation = ref(null)
// 当前地点的 NPC 列表（「此地之人」渲染 + 点击触发对话）
const currentNpcs = ref([])
async function loadNpcs(locId) {
  try {
    currentNpcs.value = await getNpcsByLocation(locId)
  } catch {
    currentNpcs.value = []
  }
}
watch(view, (v) => {
  currentLocation.value = v?.ring0 ?? null
  // 切换节点后刷新此地 NPC（「此地之人」）
  if (v?.ring0?.id) loadNpcs(v.ring0.id)
  else currentNpcs.value = []
}, { immediate: true })

/** 移动到 ring1 对角邻居（探索 = 移动）。
 *  后端会并发调 agent 生成新位置的 ring1，可能耗时数秒，期间显示地图遮罩。 */
async function moveTo(netId) {
  if (!player.value || mapMoving.value) return
  if (netId === view.value?.ring0?.id) return
  mapMoving.value = true
  try {
    await moveToNet(netId)
    // 移动后重拉视野（后端会自动补齐新位置的 ring1）
    await loadView()
    if (player.value) player.value.location_id = netId
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '移动失败' })
  } finally {
    mapMoving.value = false
  }
}

/** 邻近之地（ring1）卡片点击 */
function onNeighborSelect(item) {
  moveTo(item.id)
}

/** 场景卡片点击 → 进入场景（已在该场景则忽略） */
function onSceneSelect(item) {
  if (inScene.value?.id === item.id) return
  onEnterScene(item.scene_type)
}

/** 进入场景 */
async function onEnterScene(sceneType) {
  if (!view.value?.ring0) return
  try {
    const r = await enterScene(view.value.ring0.id, sceneType)
    if (player.value) player.value.scene_id = r.scene_id
    inScene.value = scenes.value.find((s) => s.scene_type === sceneType) || null
    bus.emit(BusEvents.TOAST, { type: 'info', message: `进入${inScene.value?.name || '场景'}` })
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '进入场景失败' })
  }
}

/** 退出场景 */
async function onExitScene() {
  try {
    await exitScene()
    if (player.value) player.value.scene_id = null
    inScene.value = null
    bus.emit(BusEvents.TOAST, { type: 'info', message: '退出场景，回到地图' })
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '退出场景失败' })
  }
}

/** 点击 NPC 卡片 → 原子化触发对话（事件总线，全局 NpcDialog 监听处理） */
function onNpcSelect(npc) {
  if (!player.value?.id) return
  bus.emit(BusEvents.NPC_DIALOG_OPEN, { playerId: player.value.id, npcId: npc.id })
}

onMounted(loadPlayer)

/* ============ 跨组件面板控制（事件总线） ============ */
/** 监听 BAG_OPEN：其它组件（如商店联动）请求打开/置顶背包 */
const offBagOpen = bus.on(BusEvents.BAG_OPEN, () => {
  bagOpen.value = true
})
onUnmounted(() => {
  offBagOpen && offBagOpen()
})

/** 功能图标点击：背包/角色/斗技/战斗切换弹窗，其余暂记录 */
function onIconSelect(key) {
  if (key === 'bag') {
    bagOpen.value = !bagOpen.value
    return
  }
  if (key === 'player') {
    playerPanelOpen.value = !playerPanelOpen.value
    return
  }
  if (key === 'skill') {
    skillPanelOpen.value = !skillPanelOpen.value
    return
  }
  if (key === 'battle') {
    onBattleStart()
    return
  }
  console.log('选中功能：', key)
}

/* ============ 战斗 ============ */
/** 固定测试怪 mobId */
const TEST_MOB_ID = 'WB-001'

/** 开始战斗：点战斗按钮 → 调后端开战 → 打开战斗界面 */
async function onBattleStart() {
  if (battleOpen.value) return
  battleBusy.value = true
  battleOpen.value = true
  try {
    battleSnapshot.value = await startBattle(TEST_MOB_ID)
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '开始战斗失败' })
    battleOpen.value = false
  } finally {
    battleBusy.value = false
  }
}

/** 玩家行动（普攻/斗技/逃跑） */
async function onBattleAction(action) {
  if (battleBusy.value || battleSnapshot.value?.over) return
  battleBusy.value = true
  try {
    battleSnapshot.value = await battleAction(action.type, action.slot)
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '行动失败' })
  } finally {
    battleBusy.value = false
  }
}

/** 关闭战斗界面（战斗结束后） */
async function onBattleClose() {
  battleOpen.value = false
  battleSnapshot.value = null
  // 刷新玩家信息（hp/energy/status 可能已变）
  await loadPlayer()
}

/** 历练按钮 → 开始历练 */
function onTempering() {
  onStartTraining()
}

/** 停止历练按钮 */
function onStopTrainingClick() {
  onStopTraining()
}

/** 采集按钮（后续接后端采集接口） */
function onCollect() {
  console.log('采集')
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
          v-if="currentLocation"
          :location="currentLocation"
          :npcs="currentNpcs"
          class="current-map"
          @npc-select="onNpcSelect"
        />
        <!-- 左侧地图抽屉：邻近之地（ring1 对角邻居）+ 场景（仅城市） -->
        <div class="map-drawers">
          <MapDrawer
            class="drawer-item"
            title="邻近之地"
            :items="view?.ring1 || []"
            @select="onNeighborSelect"
          />
          <MapDrawer
            v-if="currentLocation?.loc_type === 'city' && scenes.length"
            class="drawer-item"
            title="城内场景"
            :items="scenes"
            @select="onSceneSelect"
          />
          <!-- 退出场景按钮（玩家在场景内时显示） -->
          <button
            v-if="inScene"
            type="button"
            class="exit-scene-btn"
            @click="onExitScene"
          >
            退出「{{ inScene.name }}」←
          </button>
        </div>
      </div>
      <div class="game-logs">
        <!-- 历练日志 -->
        <AdventureLog
          v-model:collapsed="logCollapsed"
          class="adventure-log"
          :status="player?.status ?? 1"
          :location-type="currentLocation?.loc_type ?? ''"
          :logs="trainingLogs"
          @tempering="onTempering"
          @stop="onStopTrainingClick"
        />
        <!-- 采集日志 -->
        <CollectLog
          v-model:collapsed="collectCollapsed"
          class="collect-log"
          @collect="onCollect"
        />
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

    <!-- 背包弹窗（功能栏上方，可拖拽，动态层级） -->
    <BagPanel
      v-model="bagOpen"
      v-model:pos="bagPos"
      :player-id="player?.id"
    />

    <!-- 角色面板弹窗（功能栏上方，可拖拽，动态层级） -->
    <PlayerPanel
      v-model="playerPanelOpen"
      v-model:pos="playerPos"
      :player="player"
    />

    <!-- 斗技弹窗（功能栏上方，可拖拽，动态层级） -->
    <SkillPanel
      v-model="skillPanelOpen"
      v-model:pos="skillPos"
      :player="player"
    />

    <!-- 地图移动遮罩：等待后端生成节点/拉视野，阻断重复点击 -->
    <div
      v-if="mapMoving"
      class="map-moving-overlay"
    >
      <div class="map-moving-box">
        <div class="map-moving-spinner" />
        <div class="map-moving-text">
          正在前往…
        </div>
      </div>
    </div>

    <!-- 战斗界面（全屏覆盖层） -->
    <BattlePanel
      v-if="battleOpen"
      :snapshot="battleSnapshot"
      :busy="battleBusy"
      @action="onBattleAction"
      @close="onBattleClose"
    />
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
  width: 1200px;
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
  gap: 10px;
  .game-map{
    width: 860px;
    overflow-y: auto;
    height: 100%;
  }
  .game-logs{
    flex: 1;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 8px;
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

/* 退出场景按钮：玩家在场景内时显示 */
.exit-scene-btn {
  width: 100%;
  padding: 10px 0;
  font-size: 14px;
  letter-spacing: 2px;
  color: #e8d5a0;
  background: rgba(10, 8, 6, 0.55);
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 6px;
  cursor: pointer;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  transition: all 0.2s ease;
}

.exit-scene-btn:hover {
  background: rgba(180, 150, 90, 0.2);
  border-color: rgba(220, 190, 120, 0.7);
}

/* 地图移动遮罩：等待 agent 生成节点/拉视野，阻断重复点击 */
.map-moving-overlay {
  position: absolute;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(2px);
}

.map-moving-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.map-moving-spinner {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 3px solid rgba(200, 168, 104, 0.2);
  border-top-color: #d4a868;
  animation: map-moving-spin 0.9s linear infinite;
}

@keyframes map-moving-spin {
  to {
    transform: rotate(360deg);
  }
}

.map-moving-text {
  font-size: 16px;
  color: #e8d5a0;
  letter-spacing: 4px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  animation: map-moving-fade 1.5s ease-in-out infinite;
}

@keyframes map-moving-fade {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
</style>
