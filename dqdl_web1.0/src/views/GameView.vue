<script setup>
/**
 * 游戏主界面：左上角玩家信息 + 右下角功能图标栏 + 中央当前地图。
 *
 * 地图系统：location_net（网状平面地图，对角邻接）+ location_scene（城内场景）。
 *  - 玩家位置由后端 player.location_id / scene_id 维护，进页面时由 loadPlayer 拉取。
 *  - 「当前地图」= 视野 ring0（玩家所在节点），「邻近之地」= ring1 对角邻居。
 *  - 移动到 ring1 邻居 = 探索（后端自动补齐新位置的 ring1）。
 *  - 城市地点显示「场景」面板（坊市/佣兵公会/炼药师公会），可进/退场景。
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlayerInfo from '../components/PlayerInfo.vue'
import IconToolbar from '../components/IconToolbar.vue'
import BagPanel from '../components/BagPanel.vue'
import PlayerPanel from '../components/PlayerPanel.vue'
import SkillPanel from '../components/SkillPanel.vue'
import TaskPanel from '../components/TaskPanel.vue'
import MiniMap from '../components/MiniMap.vue'
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
  getPendingStates,
} from '../api'
import { scriptStreamUrl, getScriptNode } from '../api/script'
import { dispatchSseEvent, sseEventNames } from '../utils/sseEventHandlers'
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

// 任务弹窗显隐
const taskPanelOpen = ref(false)

// 小地图弹窗显隐
const miniMapOpen = ref(false)

// 战斗界面
const battleOpen = ref(false)

// 奇遇红点（发现新奇遇时亮起，打开列表时清除）
const encounterBadge = ref(false)
const battleSnapshot = ref(null)
const battleBusy = ref(false)

// 弹窗拖拽位置（null = 沿用默认右下定位；拖动后转为 {x,y}）
const bagPos = ref(null)
const playerPos = ref(null)
const skillPos = ref(null)
const taskPos = ref(null)
const miniMapPos = ref(null)

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
      // 检测新奇遇日志（mob_id='encounter'），弹 Toast + 亮红点
      const newEncounter = newLogs.find(
        (l) => l.mob_id === 'encounter' && l.id > (lastSeenLogId.value || 0)
      )
      if (newEncounter) {
        encounterBadge.value = true
        // 从 keywords 解析奇遇标题
        let encTitle = '一处机缘'
        try {
          const kws = typeof newEncounter.keywords === 'string' ? JSON.parse(newEncounter.keywords) : newEncounter.keywords
          const encKw = (kws || []).find((k) => k.type === 'encounter')
          if (encKw) encTitle = encKw.text
        } catch { /* ignore */ }
        bus.emit(BusEvents.TOAST, { type: 'info', message: `✨ 发现奇遇：${encTitle}` })
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
    // 恢复进行中事件（剧本/修炼等，按 type 分发）
    await checkPendingStates()
  } catch (err) {
    errorMsg.value = err.message || '加载玩家信息失败'
  } finally {
    loading.value = false
  }
}

/**
 * 恢复玩家进行中的事件（剧本演出/修炼等）。
 * 查 pending-states 接口，按事件 type 分发：
 *   - script：调 getScriptNode 拿当前节点 → emit SCRIPT_NODE_READY（复用 SSE 收到时的演出逻辑）
 *   - cultivation：现有修炼恢复由组件按 player.status===4 处理（保留按钮入口），此处不重复
 * 新增事件类型只需在此加分支。
 */
async function checkPendingStates() {
  try {
    const states = await getPendingStates()
    if (!Array.isArray(states) || states.length === 0) return
    for (const s of states) {
      if (s.type === 'script') {
        // 剧本：拿当前节点 → 触发演出弹窗（复用 SSE 的恢复路径）
        const instanceId = s.data?.instance_id
        if (instanceId) {
          const node = await getScriptNode(instanceId)
          bus.emit(BusEvents.SCRIPT_NODE_READY, { node })
        }
      }
      // cultivation：现有机制（player.status===4 显示「修炼中」按钮）已覆盖，无需此处处理
      // 未来新增事件类型在此加分支
    }
  } catch (err) {
    console.warn('恢复进行中事件失败：', err)
  }
}

/** 拉取玩家地图视野（ring0 当前节点 + ring1 对角邻居） */
async function loadView() {
  try {
    // 先用 player 持久化的位置占位，避免 view/scenes 加载期间中央退化成"地图节点"
    // （刷新时玩家若在场景内，应直接显示场景，而不是先闪一下城市节点）
    primeFromPlayer()
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

/**
 * 用 player 持久化的位置先占位（刷新瞬间）：
 * - 在场景内（scene_id 非 null）：inScene 先占位为仅含 id 的场景对象，
 *   待 getMapScenes 拿到完整信息后 syncInScene 会补全 name/description 等。
 * - 不在场景：inScene 置 null，currentLocation 自然落到 view.ring0。
 * 占位期间中央面板会因 name/description 缺失而渲染空值，可由 initializing 标志盖住。
 */
function primeFromPlayer() {
  if (!player.value) return
  if (player.value.scene_id != null) {
    // 仅占位 id，完整字段等 scenes 加载后补全
    if (!inScene.value || inScene.value.id !== player.value.scene_id) {
      inScene.value = { id: player.value.scene_id, name: '', description: '', scene_type: '' }
    }
  } else {
    inScene.value = null
  }
}

/** 根据 player.scene_id 同步当前场景对象（scenes 加载后补全完整字段） */
function syncInScene() {
  if (!player.value || player.value.scene_id == null) {
    inScene.value = null
    return
  }
  inScene.value = scenes.value.find((s) => s.id === player.value.scene_id) || null
}

/** 当前地点（中央 CurrentMap 渲染对象）：
 *  - 在场景内 → 显示场景（场景名/描述/该场景 NPC），场景是叶子节点
 *  - 否则     → 显示地图节点 ring0
 *  场景对象用 scene_type 作为 loc_type 供 CurrentMap 匹配图标。
 *  占位场景（name 为空，scenes 未加载完）时不渲染，避免闪烁半成品。 */
const currentLocation = computed(() => {
  if (inScene.value) {
    // 占位对象（刷新瞬间、scenes 未加载完）：name 为空，返回 null 让 loading 遮罩兜住
    if (!inScene.value.name) return null
    return { ...inScene.value, loc_type: inScene.value.scene_type }
  }
  return view.value?.ring0 ?? null
})

// 当前地点的 NPC 列表（「此地之人」渲染 + 点击触发对话）
// 后端 GET /npc/location/:id 返回 { static, dynamic }，这里合并成单数组并打 is_dynamic 标记。
const currentNpcs = ref([])
async function loadNpcs(locId) {
  try {
    const data = await getNpcsByLocation(locId)
    // 容错：兼容后端万一返回旧数组结构
    if (Array.isArray(data)) {
      currentNpcs.value = data
      return
    }
    currentNpcs.value = [
      ...(data.static || []).map((n) => ({ ...n, is_dynamic: false })),
      ...(data.dynamic || []).map((n) => ({ ...n, is_dynamic: true })),
    ]
  } catch {
    currentNpcs.value = []
  }
}
/** 加载场景内 NPC：优先用 getMapScenes 返回里已带的 npcs，避免额外请求 */
function loadSceneNpcs(scene) {
  if (!scene) {
    currentNpcs.value = []
    return
  }
  if (Array.isArray(scene.npcs) && scene.npcs.length) {
    currentNpcs.value = scene.npcs
  } else {
    currentNpcs.value = []
  }
}
// 节点切换 / 场景进出 都会刷新中央地点与「此地之人」
watch(
  [() => view.value, () => inScene.value],
  ([v, scene]) => {
    if (scene) {
      // 在场景内：NPC 取场景自带（getMapScenes 已附带）
      loadSceneNpcs(scene)
    } else if (v?.ring0?.id) {
      // 在地图节点：拉该节点 NPC
      loadNpcs(v.ring0.id)
    } else {
      currentNpcs.value = []
    }
  },
  { immediate: true },
)

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
    // 用 enterScene 返回的 scene 信息兜底补全 scenes（含 description 等）
    const existed = scenes.value.find((s) => s.scene_type === sceneType)
    if (existed && r.scene) {
      Object.assign(existed, r.scene)
    }
    inScene.value = existed || (r.scene ? { ...r.scene } : null)
    bus.emit(BusEvents.TOAST, { type: 'info', message: `进入${inScene.value?.name || '场景'}` })

    // [TODO] 进入场景钩子：后续接入真实剧本库后，在此触发 RPG 分支对话。
    //   当前为假数据版，已注释——待「剧本细化/结构化」完成后，从后端按 scene/NPC 取真实剧本再弹。
    // // 坊市(market)且场景内有动态演员 → 触发 RPG 分支对话
    // // 仅「主动进入」走这里；刷新恢复路径(syncInScene)不走本函数，天然不会重弹。
    // const sceneObj = inScene.value
    // const npcs = sceneObj?.npcs || []
    // const hasDynamic = npcs.some((n) => n.is_dynamic)
    // if (sceneObj?.scene_type === 'market' && hasDynamic) {
    //   const dynNpc = npcs.find((n) => n.is_dynamic)
    //   bus.emit(BusEvents.SCENE_BRANCH_OPEN, { npc: dynNpc, scene: sceneObj })
    // }
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
  // npc.is_dynamic 标记来自后端（static/dynamic 合并时打标），决定对话走哪张表
  bus.emit(BusEvents.NPC_DIALOG_OPEN, {
    playerId: player.value.id,
    npcId: npc.id,
    npcType: npc.is_dynamic ? 'dynamic' : 'static',
  })
}

onMounted(loadPlayer)

/* ============ 剧本触发 SSE 长连接（通用 event 通道） ============ */
/** 玩家进入游戏后建立 SSE，后端按 event 名推送（剧本/未来聊天等）。
 *  前端用 sseEventHandlers 按事件名分发，新增事件类型无需改这里。 */
let scriptEs = null
function startScriptStream() {
  // 无 token 不建连（未登录）
  const token = localStorage.getItem('dqdl_token')
  if (!token) return
  try {
    scriptEs = new EventSource(scriptStreamUrl())
    // 按已注册的事件名监听，统一走 dispatchSseEvent 分发
    sseEventNames.forEach((eventName) => {
      scriptEs.addEventListener(eventName, (e) => {
        try {
          const data = JSON.parse(e.data)
          dispatchSseEvent(eventName, data)
        } catch (err) {
          console.warn(`SSE ${eventName} 解析失败:`, err)
        }
      })
    })
    // EventSource 断开会自动重连，onerror 不主动 close
    scriptEs.onerror = () => {
      /* 自动重连，无需处理 */
    }
  } catch (err) {
    console.warn('剧本 SSE 建立失败:', err)
  }
}
function stopScriptStream() {
  if (scriptEs) {
    scriptEs.close()
    scriptEs = null
  }
}
onMounted(startScriptStream)
onUnmounted(stopScriptStream)

/* ============ 跨组件面板控制（事件总线） ============ */
/** 监听 BAG_OPEN：其它组件（如商店联动）请求打开/置顶背包 */
const offBagOpen = bus.on(BusEvents.BAG_OPEN, () => {
  bagOpen.value = true
})
/** 监听 PLAYER_UPDATE：丹药使用等动作后，由发起方 emit 聚合后的 player，整体覆盖刷新 */
const offPlayerUpdate = bus.on(BusEvents.PLAYER_UPDATE, ({ player: next }) => {
  if (next) player.value = next
})
/** 监听 PLAYER_STATUS_CHANGE：秘境进入/撤退等改变 status 的动作后，重新拉取最新 player */
const offStatusChange = bus.on(BusEvents.PLAYER_STATUS_CHANGE, () => {
  if (player.value?.id) loadPlayer()
})
onUnmounted(() => {
  offStatusChange && offStatusChange()
  offBagOpen && offBagOpen()
  offPlayerUpdate && offPlayerUpdate()
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
  if (key === 'task') {
    taskPanelOpen.value = !taskPanelOpen.value
    return
  }
  if (key === 'battle') {
    onBattleStart()
    return
  }
  if (key === 'encounter') {
    encounterBadge.value = false // 打开即清红点
    bus.emit(BusEvents.ADVENTURE_OPEN)
    return
  }
  // 宝物：打开角色面板（PlayerPanel 已含宝物区，装备/卸下/tooltip）
  if (key === 'treasure') {
    playerPanelOpen.value = !playerPanelOpen.value
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

    <!-- 地图内容区：加载中/出错时不渲染，避免 view 未就绪时中央退化显示"地图节点"造成闪烁 -->
    <div
      v-show="!loading && !errorMsg"
      class="game-container"
    >
      <div class="game-map">
        <!-- 中央当前地图面板 -->
        <CurrentMap
          v-if="currentLocation"
          :location="currentLocation"
          :npcs="currentNpcs"
          :show-back="!!inScene"
          :back-text="inScene ? `退出「${inScene.name}」` : '返回上级'"
          class="current-map"
          @back="onExitScene"
          @npc-select="onNpcSelect"
        />
        <!-- 左侧地图抽屉：邻近之地（ring1 对角邻居）+ 场景（仅城市）。
             进入场景后场景是叶子节点：无邻近之地、无子场景，抽屉全部隐藏。 -->
        <div
          v-if="!inScene"
          class="map-drawers"
        >
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

    <!-- 右上角操作按钮组：地图 + 返回开始页 -->
    <div class="top-right-actions">
      <!-- 修炼中（status==4）：玩家关闭了修炼弹窗但修炼仍在后台进行，点此返回修炼界面 -->
      <button
        v-if="player?.status === 4"
        class="top-right-btn cultivating-btn"
        type="button"
        title="返回修炼界面"
        @click="bus.emit(BusEvents.CULTIVATION_ROOM_OPEN)"
      >
        🧘 修炼中
      </button>
      <button
        class="top-right-btn"
        type="button"
        title="查看地图"
        @click="miniMapOpen = !miniMapOpen"
      >
        地图
      </button>
      <button
        class="top-right-btn"
        type="button"
        @click="backToStart"
      >
        返回
      </button>
    </div>

    <!-- 右下角功能图标栏 -->
    <IconToolbar
      :badges="{ encounter: encounterBadge }"
      @select="onIconSelect"
    />

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

    <!-- 任务弹窗（功能栏上方，可拖拽，动态层级） -->
    <TaskPanel
      v-model="taskPanelOpen"
      v-model:pos="taskPos"
      :player-id="player?.id"
    />

    <!-- 小地图弹窗（右上角，可拖拽，动态层级） -->
    <MiniMap
      v-model="miniMapOpen"
      v-model:pos="miniMapPos"
      :location-id="player?.location_id"
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

/* 右上角按钮组（地图 + 返回） */
.top-right-actions {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  display: flex;
  gap: 8px;
}
.top-right-btn {
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
  &:hover {
    background: rgba(180, 150, 90, 0.2);
    border-color: rgba(220, 190, 120, 0.7);
  }
}
/* 修炼中按钮：暗绿灵气风格 + 呼吸脉冲，提示有进行中的修炼 */
.cultivating-btn {
  color: #6fbfa8;
  background: rgba(20, 40, 34, 0.6);
  border-color: rgba(111, 191, 168, 0.5);
  animation: cultivating-pulse 1.8s ease-in-out infinite;
  &:hover {
    background: rgba(30, 74, 62, 0.6);
    border-color: #6fbfa8;
    color: #8fd8c0;
  }
}
@keyframes cultivating-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(111, 191, 168, 0); }
  50% { box-shadow: 0 0 10px 1px rgba(111, 191, 168, 0.45); }
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
