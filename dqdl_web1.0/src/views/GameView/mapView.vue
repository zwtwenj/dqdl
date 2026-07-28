<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { getPlayerView, getMapScenes } from '@/api/mapdemo'
import { startMove, cancelMove as apiCancelMove, getCurrentMove, arriveMove } from '@/api/move'
import { usePlayerStore } from '@/stores/player'
import Dlg from '@/components1/dlg.vue'
import Button from '@/components1/button.vue'
import { confirm } from '@/components1/confirm'
import { bus, BusEvents } from '@/utils/eventBus'

const playerStore = usePlayerStore()

const view = ref(null)          // getPlayerView 返回：{ ring0, ring1, nodes, edges, fog }
const selected = ref(null)      // 右侧展示的节点（默认 ring0）
const loading = ref(false)
const error = ref('')

// —— 以 ring0 为中心的固定步长布局 ——
// 方向是 4 对角（NE/NW/SE/SW），每个网格步长固定像素值。
// 节点像素坐标 = 画布中心 + (gx - ring0.gx) * STEP / (gy - ring0.gy) * STEP。
// 这样当前点居中、4 个对角邻居对称散开，两格内（ring0+ring1+ring2）必然在画布内。
// 注意：STEP 是渲染像素，与后端 MOVE_DISTANCE（里）无关，只是恰好数值相同。
const STEP = 70
const CENTER_X = 179            // 画布宽 358 的中心
const CENTER_Y = 145            // 画布高 290 的中心

const ring0 = computed(() => view.value?.ring0 || null)

/** 节点 → 画布像素坐标（以 ring0 为原点）。
 *  返回纯数字，供两处使用：
 *  - 节点定位：模板里拼成 '179px'（CSS left/top 必须带单位，否则被忽略导致塌缩到左上角）
 *  - SVG 连线：直接用纯数字（SVG x1/y1 不接受 'px' 单位，只接受用户单位） */
function nodeXY(node) {
  const c = ring0.value
  if (!c || node.gx == null || node.gy == null || c.gx == null || c.gy == null) {
    return { x: CENTER_X, y: CENTER_Y }
  }
  const x = CENTER_X + (node.gx - c.gx) * STEP
  const y = CENTER_Y + (node.gy - c.gy) * STEP
  // 防御 NaN/Infinity：异常时回退到中心
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { x: CENTER_X, y: CENTER_Y }
  }
  return { x, y }
}

/** 节点定位样式（带 px 单位，供 CSS left/top） */
function nodePos(node) {
  const { x, y } = nodeXY(node)
  return { left: x + 'px', top: y + 'px' }
}

// 节点 id → 节点对象，便于画边时取坐标
const nodeMap = computed(() => {
  const map = {}
  for (const n of view.value?.nodes || []) map[n.id] = n
  return map
})

const edges = computed(() => {
  const map = nodeMap.value
  return (view.value?.edges || []).map((e, i) => {
    const a = map[e.from_id ?? e.fromId ?? e.from]
    const c = map[e.to_id ?? e.toId ?? e.to]
    if (!a || !c) return null
    const pa = nodeXY(a)
    const pc = nodeXY(c)
    return { id: i, x1: pa.x, y1: pa.y, x2: pc.x, y2: pc.y }
  }).filter(Boolean)
})

const ring0Id = computed(() => ring0.value?.id)

// 节点 loc_type → 图标路径（后端取值：wild/city/sect/secret，与 public/icon/location 一一对应）
const LOC_ICON = {
  city: '/icon/location/city.png',
  sect: '/icon/location/sect.png',
  secret: '/icon/location/secret.png',
  wild: '/icon/location/wild.png',
}
function locIcon(node) {
  return LOC_ICON[node?.loc_type] || LOC_ICON.wild
}

function isCurrent(node) {
  return ring0Id.value != null && node.id === ring0Id.value
}

/** 节点是否为当前所在节点的对角邻居（ring1，可移动目标）。
 *  与后端 move-session 的邻接校验一致：|dx|==1 && |dy|==1 */
function isMovable(node) {
  const c = ring0.value
  if (!c || node.gx == null || node.gy == null) return false
  return Math.abs(node.gx - c.gx) === 1 && Math.abs(node.gy - c.gy) === 1
}

// 点击节点：仅触发移动（对角邻居 → 弹移动预览），不切换右侧选中信息。
// selected 始终跟随当前所在地 ring0，右侧永远显示玩家所在地的信息。
function onSelectNode(node) {
  if (isMovable(node) && !moveSession.value) {
    // 正在移动中时不允许发起新移动
    openMovePreview(node)
  }
}

// —— 移动弹窗（两阶段：preview 预览态 / moving 移动中态）——
const moveDlgVisible = ref(false)
const moveTarget = ref(null)        // 目标节点（地图节点对象）
const moveSession = ref(null)       // 进行中的移动 session（start/atRestore 填充）
const moveError = ref('')
const remainingSec = ref(0)         // 移动中剩余秒数（倒计时）
let tickTimer = null                // 倒计时定时器

// 移动距离常量（里），与后端 move-session.service 的 MOVE_DISTANCE 对齐
const MOVE_DISTANCE = 70

// 弹窗阶段：有 session 就是「移动中」，否则是「预览确认」
const isMoving = computed(() => !!moveSession.value)

/** 秒数 → 时长 HH:MM:SS（如 180 → 00:03:00）。
 *  前后端时长算法一致（距离×60/speed），前端纯展示格式化，不依赖后端时间点。 */
function fmtDuration(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const pad = (n) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return `${pad(h)}:${pad(m)}:${pad(r)}`
}

/** 前端预估单格移动耗时（秒）：ceil(距离×60/speed)。
 *  speed 用 playerStore.quick（final_attrs.quick，含加成的面板敏捷）。
 *  注意：此为预览估算，后端 startMove 以 base_quick+levelAttrBonus 算实际时长，
 *  两者可能略有差异，以后端返回的 session.end_at 为准。 */
const previewDurationSec = computed(() => {
  const speed = Math.max(1, playerStore.quick)
  return Math.ceil((MOVE_DISTANCE * 60) / speed)
})

/** 打开预览弹窗：不再调接口，耗时由前端按敏捷自算 */
function openMovePreview(node) {
  moveTarget.value = node
  moveDlgVisible.value = true
  moveError.value = ''
}

/** 确认移动：startMove 建 session → 进入倒计时态 */
async function confirmMove() {
  const target = moveTarget.value
  if (!target?.id || moveSession.value) return
  moveError.value = ''
  try {
    const session = await startMove(target.id)
    moveSession.value = session
    arrivedHandled = false        // 新一轮移动，重置到达标志
    startTick(session)
    // 刷新玩家状态（status → MOVING），状态栏同步显示「移动中」
    playerStore.load()
    bus.emit(BusEvents.TOAST, { type: 'info', message: `开始前往 ${session.to_name}` })
  } catch (err) {
    moveError.value = err.message || '移动失败'
  }
}

let arriveFallbackTimer = null    // 倒计时到期后的兜底定时器（SSE 未送达时主动 arrive）

/** 启动倒计时：每秒更新 remainingSec。
 *  到期后不立即 arrive——优先等后端 SSE 推送 move_arrived（权威信号），
 *  若 SSE 迟迟未到（连接异常），延迟 3s 兜底主动调 arrive。 */
function startTick(session) {
  stopTick()
  const tick = () => {
    const now = Date.now()
    const end = new Date(session.end_at).getTime()
    const left = Math.max(0, Math.ceil((end - now) / 1000))
    remainingSec.value = left
    if (left <= 0) {
      stopTick()
      // 到期：显示"结算中"，启动兜底（SSE 正常的话会在 3s 内先收到 move_arrived）
      if (arriveFallbackTimer) clearTimeout(arriveFallbackTimer)
      arriveFallbackTimer = setTimeout(() => doArrive(), 3000)
    }
  }
  tick()
  tickTimer = setInterval(tick, 1000)
}

function stopTick() {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

// 到达互斥标志：onMoveArrived（SSE）与 doArrive（兜底）可能因竞态同时触发，
// 任一执行后置 true，另一个直接返回，避免重复 refreshView → 重复 loadScenes。
let arrivedHandled = false

/** 兜底到达结算（SSE 未送达时）：arriveMove → 刷新地图 → 关弹窗。
 *  正常情况下由 onMoveArrived（SSE 监听）处理，这里只在 SSE 异常时触发。 */
async function doArrive() {
  if (arriveFallbackTimer) { clearTimeout(arriveFallbackTimer); arriveFallbackTimer = null }
  if (arrivedHandled) return        // SSE 已处理到达，兜底跳过
  arrivedHandled = true
  try {
    const res = await arriveMove()
    bus.emit(BusEvents.TOAST, { type: 'success', message: `已到达 ${res?.session?.to_name || moveTarget.value?.name || ''}` })
  } catch (err) {
    moveError.value = err.message || '到达结算失败，请重试'
    arrivedHandled = false          // 失败则允许重试
    return
  }
  // 到达后刷新地图（玩家状态由 GameView 的 SSE 监听刷新，这里不重复）
  closeMoveDlg()
  await refreshView()
}

/** 收到 SSE 移动到达事件（权威路径）：取消兜底 → 关弹窗 → 刷新地图 */
async function onMoveArrived(data) {
  if (arriveFallbackTimer) { clearTimeout(arriveFallbackTimer); arriveFallbackTimer = null }
  if (arrivedHandled) return        // 兜底已处理到达，SSE 跳过
  arrivedHandled = true
  stopTick()
  bus.emit(BusEvents.TOAST, { type: 'success', message: `已到达 ${data?.to_name || ''}` })
  closeMoveDlg()
  await refreshView()
}

/** 取消移动（仅移动中态可用）：二次确认 → cancelMove → 停原地 */
async function doCancelMove() {
  if (!moveSession.value) return
  // 二次确认，避免误触中止移动
  const ok = await confirm({
    title: '取消移动',
    content: `确定取消前往 ${moveSession.value?.to_name || ''}？将停留在原地。`,
    okText: '取消移动',
    cancelText: '继续移动',
  })
  if (!ok) return
  try {
    await apiCancelMove()
    bus.emit(BusEvents.TOAST, { type: 'info', message: '已取消移动' })
  } catch (err) {
    moveError.value = err.message || '取消失败'
    return
  }
  closeMoveDlg()
  // 刷新玩家状态（status → IDLE），状态栏同步
  playerStore.load()
}

/** 彻底关闭弹窗并清理移动状态（到达/取消时用）：停倒计时 + 清空 session + 重置到达标志 */
function closeMoveDlg() {
  stopTick()
  if (arriveFallbackTimer) { clearTimeout(arriveFallbackTimer); arriveFallbackTimer = null }
  arrivedHandled = false       // 清理到达标志，下次移动可正常结算
  moveDlgVisible.value = false
  moveTarget.value = null
  moveSession.value = null
  moveError.value = ''
  remainingSec.value = 0
}

/** 仅隐藏弹窗 UI，保留移动状态与倒计时（点 X 或状态栏切换时用）：
 *  移动仍在后台进行，可通过状态栏重新打开弹窗查看 */
function hideMoveDlg() {
  moveDlgVisible.value = false
}

/** 弹窗关闭按钮（右上角 X）：
 *  预览态：直接清理（没开始移动）；移动中态：仅隐藏，移动继续后台进行 */
function onDlgClose() {
  if (isMoving.value) {
    hideMoveDlg()
  } else {
    closeMoveDlg()
  }
}

/** 恢复进行中的移动（页面刷新/onMounted 时调） */
async function restoreMove() {
  try {
    const session = await getCurrentMove()
    if (session) {
      // 移动中态用 moveSession 渲染（to_name 等），无需设 moveTarget
      moveSession.value = session
      arrivedHandled = false      // 恢复进行中的移动，重置到达标志
      moveDlgVisible.value = true
      startTick(session)
    }
  } catch {
    // lazy arrive 已在后端处理，这里静默
  }
}

/** 重新拉取玩家视野（移动后刷新地图），并重置选中为新的当前位置 */
async function refreshView() {
  try {
    const data = await getPlayerView()
    view.value = data
    selected.value = data?.ring0 || null
  } catch (err) {
    error.value = err.message || '地图刷新失败'
  }
}

// 监听「打开移动弹窗」事件（玩家状态栏点击「移动中」触发）：
// 若正在移动但弹窗被隐藏，则重新显示
// 监听「移动到达」事件（后端 SSE 推送 move_arrived）：刷新地图 + 关弹窗
let offMoveDialogOpen = null
let offMoveArrived = null
onMounted(() => {
  offMoveDialogOpen = bus.on(BusEvents.MOVE_DIALOG_OPEN, () => {
    if (moveSession.value && !moveDlgVisible.value) {
      moveDlgVisible.value = true
    }
  })
  offMoveArrived = bus.on(BusEvents.PLAYER_MOVE_ARRIVED, (data) => {
    onMoveArrived(data)
  })
})

onUnmounted(() => {
  stopTick()
  if (arriveFallbackTimer) clearTimeout(arriveFallbackTimer)
  offMoveDialogOpen?.()
  offMoveArrived?.()
})

// —— 场景列表：跟随选中节点变化重新拉取 ——
const scenes = ref([])
const scenesLoading = ref(false)
const scenesError = ref('')

// 怪物图标加载失败标记：{ mob_id: true }。失败时改显示 mob_id 文字占位。
// 用 reactive 才能在 @error 回调里动态加属性触发更新。
const mobImgError = reactive({})

// 场景类型 → 中文标签（后端 scene_type: market/guild/alchemy/auction/cultivation）
const SCENE_TYPE_LABEL = {
  market: '坊市',
  guild: '公会',
  alchemy: '炼药',
  auction: '拍卖',
  cultivation: '修炼',
}
function sceneTypeLabel(t) {
  return SCENE_TYPE_LABEL[t] || t || ''
}

// 当前正在加载/已加载的节点 id，用于去重：同一节点的并发请求只发一次
let loadingSceneNodeId = null

async function loadScenes(node) {
  if (!node?.id) {
    scenes.value = []
    loadingSceneNodeId = null
    return
  }
  // 去重：仅在请求 in-flight 期间跳过同一节点的并发调用（防 SSE 到达与兜底竞态重复请求）。
  // 请求完成后必须清空标志，否则同节点永不再加载。
  if (loadingSceneNodeId === node.id) return
  loadingSceneNodeId = node.id
  scenesLoading.value = true
  scenesError.value = ''
  try {
    scenes.value = await getMapScenes(node.id)
  } catch (err) {
    scenes.value = []
    scenesError.value = err.message || '场景加载失败'
  } finally {
    scenesLoading.value = false
    loadingSceneNodeId = null      // 请求结束，允许下次重载
  }
}

// 选中节点变化时自动拉场景（含 onMounted 后 selected 初始化触发）
watch(selected, (node) => loadScenes(node))

onMounted(async () => {
  // 先加载玩家数据：移动耗时依赖 final_attrs.quick，必须先就绪，
  // 否则用户在 player 加载完前点邻居会看到错误的耗时
  await playerStore.load()
  loading.value = true
  try {
    const data = await getPlayerView()
    view.value = data
    selected.value = data?.ring0 || data?.nodes?.[0] || null
  } catch (err) {
    error.value = err.message || '地图加载失败'
    bus.emit(BusEvents.TOAST, { type: 'error', message: error.value })
  } finally {
    loading.value = false
  }
  // 恢复进行中的移动（刷新页面场景）
  await restoreMove()
})
</script>

<template>
    <div class="map-view">
        <div class="map-view-left">
            <div class="map-view-left-title">
                <div class="map-view-left-title-left"></div>
                <div class="map-view-left-title-text">
                    {{ view?.ring0?.name || (loading ? '加载中...' : '---') }}
                </div>
                <div class="map-view-left-title-right"></div>
            </div>
            <div class="map-view-left-location">
                <!-- 网状地图：SVG 连线层 + 绝对定位节点 -->
                <svg class="map-edges" v-if="ring0">
                    <line v-for="e in edges" :key="e.id"
                        :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
                        stroke="#8a7a5a" stroke-width="2" />
                </svg>
                <div
                    v-for="node in view?.nodes"
                    :key="node.id"
                    class="map-node"
                    :class="{ current: isCurrent(node), selected: selected?.id === node.id, movable: isMovable(node) }"
                    :style="nodePos(node)"
                    :title="isMovable(node) ? `前往 ${node.name}` : node.name"
                    @click="onSelectNode(node)"
                >
                    <div class="map-node-icon-wrap">
                        <img class="map-node-icon" :src="locIcon(node)" :alt="node.name">
                        <!-- 玩家当前位置标记：覆盖在地点图标上 -->
                        <img v-if="isCurrent(node)" class="map-node-marker" src="/static/1.gif" alt="你在这">
                    </div>
                    <span class="map-node-label">{{ node.name }}</span>
                </div>
                <div v-if="error" class="map-empty">{{ error }}</div>
                <div v-else-if="!loading && !view" class="map-empty">无地图数据</div>
            </div>
        </div>
        <div class="map-view-right">
            <div class="location-title">
                <div class="location-name">
                    {{ selected?.name || '---' }}
                </div>
                <div class="location-right">
                    <div class="map-button">地图</div>
                </div>
            </div>
            <div class="location-description">
                {{ selected?.description || '（暂无描述）' }}
            </div>
            <!-- 场景列表：跟随选中节点 -->
            <div class="scene-list" v-if="scenes.length">
                <div class="scene-list-title">场景</div>
                <div
                    v-for="sc in scenes"
                    :key="sc.id"
                    class="scene-item"
                >
                    <img src="/icon/icon-exit.gif">
                    <span class="scene-name">{{ sc.name }}</span>
                    <span v-if="sc.scene_type" class="scene-type">{{ sceneTypeLabel(sc.scene_type) }}</span>
                </div>
            </div>
            <!-- 常见怪物：common_mobs 有内容才显示（野外节点才有）。
                 图标加载失败时显示 mob_id 文字占位，名字走 v-tooltip 悬浮提示。 -->
            <div class="location-mobs" v-if="selected?.common_mobs?.length">
              <div class="location-mobs-title">常见怪物</div>
              <div class="location-mobs-list">
                <div
                    v-for="mob in selected.common_mobs"
                    :key="mob.mob_id"
                    v-tooltip="mob.name"
                    class="location-mob-item"
                >
                    <img
                        v-if="!mobImgError[mob.mob_id]"
                        :src="`/icon/mob/${mob.mob_id}.png`"
                        :alt="mob.name"
                        @error="mobImgError[mob.mob_id] = true"
                    >
                    <span v-else class="location-mob-fallback">{{ mob.mob_id }}</span>
                </div>
              </div>
            </div>
        </div>

        <!-- 移动弹窗：预览态(显示预计时间) / 移动中态(倒计时进度条) -->
        <Dlg v-if="moveDlgVisible" title="移动" @close="onDlgClose">
            <!-- 预览态：确认是否前往 -->
            <div v-if="!isMoving" class="move-dlg">
                <p class="move-dlg-text">
                    是否前往 <span class="move-target-name">{{ moveTarget?.name }}</span>
                    <span v-if="moveTarget?.danger_level" class="move-dlg-tip">
                        （危险等级 {{ moveTarget.danger_level }}）
                    </span>？
                </p>
                <p class="move-dlg-meta">
                    预计需要 <span class="move-time">{{ fmtDuration(previewDurationSec) }}</span>
                    <span class="move-dlg-speed">（敏捷 {{ playerStore.quick }}）</span>
                </p>
                <p v-if="moveError" class="move-dlg-error">{{ moveError }}</p>
                <div class="move-dlg-actions">
                    <Button class="move-btn" @click="confirmMove">
                        前往
                    </Button>
                    <Button class="move-btn" @click="closeMoveDlg">取消</Button>
                </div>
            </div>
            <!-- 移动中态：倒计时 + 可取消 -->
            <div v-else class="move-dlg">
                <p class="move-dlg-text">
                    正在前往 <span class="move-target-name">{{ moveSession?.to_name }}</span>
                </p>
                <p class="move-dlg-meta">
                    <span v-if="remainingSec > 0">
                        剩余 <span class="move-time">{{ fmtDuration(remainingSec) }}</span>
                    </span>
                    <span v-else>已到达，结算中...</span>
                </p>
                <p v-if="moveError" class="move-dlg-error">{{ moveError }}</p>
                <div class="move-dlg-actions">
                    <Button v-if="remainingSec <= 0" class="move-btn" @click="doArrive">到达</Button>
                    <Button class="move-btn" @click="doCancelMove">取消移动</Button>
                </div>
            </div>
        </Dlg>
    </div>
</template>

<style lang="less" scoped>
.map-view{
    display: flex;
    width: 100%;
    gap: 10px;
}
.map-view-left{
    border: 1px solid var(--border-dark);
    width: 360px;
}
.map-view-left-title{
    background: url("/static/field-title-bg.gif") repeat-x;
    display: flex;
    .map-view-left-title-text{
        flex: 1;
        text-align: center;
        color: var(--text-light);
    }
    .map-view-left-title-left{
        background: url("/static/field-title-left.gif") no-repeat;
        height: 21px;
        width: 17px;
    }
    .map-view-left-title-right{
        background: url("/static/field-title-right.gif") no-repeat;
        height: 21px;
        width: 17px;
    }
}
.map-view-left-location{
    position: relative;          /* 节点绝对定位的参照 */
    height: 290px;
    border: 1px solid var(--border-dark);
    margin: 1px;
    background: url("/static/field-bg.gif") no-repeat center center;
    background-size: 100% 100%;  /* 拉伸铺满画布 */
    overflow: hidden;
}
/* SVG 连线层：铺满画布，置于节点之下 */
.map-edges{
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
}
/* 网状节点：以坐标点为中心，loc_type 图标 + 名字标签 */
.map-node{
    position: absolute;
    transform: translate(-50%, -50%);   /* 以坐标点为中心 */
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
}
/* 图标容器：相对定位，供玩家位置标记绝对覆盖 */
.map-node-icon-wrap{
    position: relative;
    line-height: 0;
}
.map-node-icon{
    width: 32px;
    height: 32px;
    display: block;
    object-fit: contain;
    /* 用 drop-shadow 做悬停/选中/当前的光晕（图标本身是 png 图案，改背景色无意义） */
    transition: filter 0.15s, transform 0.15s;
    filter: drop-shadow(0 1px 1px rgba(0,0,0,0.4));
}
/* 玩家当前位置标记：覆盖在地点图标上，与图标同尺寸 */
.map-node-marker{
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;            /* 不挡住节点点击 */
}
.map-node:hover .map-node-icon{
    transform: scale(1.15);
    filter: drop-shadow(0 0 4px rgba(240, 192, 64, 0.9));
}
.map-node.selected .map-node-icon{
    filter: drop-shadow(0 0 5px rgba(240, 192, 64, 0.95));
}
/* 当前所在节点：金色强光晕 + 红描边圈，最醒目 */
.map-node.current .map-node-icon{
    transform: scale(1.1);
    filter: drop-shadow(0 0 6px rgba(240, 192, 64, 1)) drop-shadow(0 0 3px rgba(200, 0, 0, 0.8));
}
/* 可移动节点（当前点的对角邻居）：绿色光晕提示可达 */
.map-node.movable .map-node-icon{
    filter: drop-shadow(0 0 3px rgba(80, 200, 120, 0.8));
}
.map-node.movable:hover .map-node-icon{
    filter: drop-shadow(0 0 6px rgba(80, 200, 120, 1));
}
.map-node-label{
    font-size: var(--fs-xs);
    color: var(--text-dark);
    background: rgba(233, 229, 220, 0.85);
    padding: 0 3px;
    border-radius: 2px;
    white-space: nowrap;
    line-height: 1.4;
}
.map-empty{
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-dim);
    font-size: var(--fs-md);
}
.map-view-right{
    flex: 1;
    border: 1px solid var(--border);
    background: var(--panel-bg-tint) url("/static/field-box-bg.gif") repeat-x;
    padding: 7px;
    line-height: 20px;
    .location-title{
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        .location-name{
            font-weight: bolder;
            text-decoration: underline;
        }
        .location-right{
            .map-button{
                cursor: pointer;
                text-decoration: underline;
                color: var(--link);
            }
        }
    }
    .location-description{
        margin-bottom: 10px;
    }
    .scene-list{
        margin-bottom: 10px;
        .scene-list-title{
            font-weight: bolder;
            margin-bottom: 6px;
        }
        .scene-item{
            display: flex;
            gap: 5px;
            align-items: center;
            text-decoration: underline;
            cursor: pointer;
            img{
                width: 16px;
                height: 16px;
            }
            .scene-name{
                line-height: 22px;
            }
            .scene-type{
                color: var(--text-dim);
                font-size: var(--fs-xs);
                text-decoration: none;
                border: 1px solid var(--border);
                padding: 0 4px;
                border-radius: 2px;
                line-height: 16px;
            }
        }
        .scene-item:hover{
            /* 仅保留下划线，不变色 */
        }
        .scene-empty{
            color: var(--text-faint);
            font-style: italic;
        }
    }
    .location-mobs{
      margin-top: 10px;
      .location-mobs-title{
        font-weight: bolder;
        margin-bottom: 6px;
      }
      .location-mobs-list{
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .location-mob-item{
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 50px;
        height: 50px;
        cursor: pointer;
        img{
            width: 34px;
            height: 34px;
            border-radius: 4px;
            object-fit: contain;
        }
        /* 图标加载失败时的文字占位（与图标同区域） */
        .location-mob-fallback{
            width: 34px;
            height: 34px;
            border-radius: 4px;
            border: 1px solid var(--border);
            background: var(--input-bg);
            color: var(--text-dim);
            font-size: 9px;
            line-height: 32px;
            text-align: center;
            overflow: hidden;
            white-space: nowrap;
            text-overflow: ellipsis;
        }
      }
    }
}

/* —— 移动确认弹窗内容 —— */
.move-dlg{
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
}
.move-dlg-text{
    font-size: var(--fs-lg);
    color: var(--text);
    .move-target-name{
        /* 地名：下划线强调，不变色 */
        text-decoration: underline;
        font-weight: bold;
    }
}
.move-dlg-tip{
    font-size: var(--fs-sm);
    color: var(--danger);
}
.move-dlg-meta{
    font-size: var(--fs-sm);
    color: var(--text-dim);
    .move-dlg-speed{
        color: var(--text-faint);
    }
}
/* 时间数值：强调色，醒目 */
.move-time{
    color: var(--accent);
    font-weight: bold;
}
.move-dlg-error{
    font-size: var(--fs-sm);
    color: var(--error);
}
.move-dlg-actions{
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 4px;
}
/* Button 组件自带背景图/尺寸，这里只补禁用态（移动中防重复点击） */
.move-btn.is-disabled{
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;       /* 禁用时彻底不响应点击 */
}
</style>
