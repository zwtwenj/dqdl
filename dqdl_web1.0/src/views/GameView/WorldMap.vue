<script setup>
/**
 * 大地图弹窗：640×480 视口，支持拖动浏览、按区块增量加载、虚拟化渲染。
 *
 * 坐标系模型（与小地图「以 ring0 为中心」不同）：
 *   - 世界坐标：节点 gx/gy（整数网格）
 *   - 像素坐标：worldX = gx * CELL，worldY = gy * CELL
 *   - 视口偏移：offsetX/offsetY（拖动产生，= 视口左上角对应的世界像素）
 *   - 屏幕坐标：screenX = worldX - offsetX；只渲染 0≤screenX≤W 且 0≤screenY≤H 的节点（虚拟化）
 *
 * 区块加载：地图按 CHUNK(7) 格切块，视口覆盖到哪个区块就加载哪个，已加载的缓存不重复请求。
 * 拖动时实时检查视口覆盖区块，缺失的合并请求后端 bbox，返回的节点/边增量合并进 Map/Set（无闪屏）。
 */
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import { getNodesInBBox } from '@/api/mapdemo'
import { bus, BusEvents } from '@/utils/eventBus'

// loc_type → 图标（与 mapView 一致）
const LOC_ICON = {
  city: '/icon/location/city.png',
  sect: '/icon/location/sect.png',
  secret: '/icon/location/secret.png',
  wild: '/icon/location/wild.png',
}
function locIcon(node) {
  return LOC_ICON[node?.loc_type] || LOC_ICON.wild
}

/** 节点是否可点击移动：非自身、非移动中。
 *  大地图视野广（bbox 加载），能点到更远的节点，不限制格数。 */
function isMovable(node) {
  if (props.moving) return false
  return node.id !== props.playerNetId
}

/** 点击节点：emit 给父组件(mapView)处理寻路+确认移动。
 *  若本次 pointerdown→up 之间发生了拖拽（地图移动了），忽略点击（避免拖动误触发移动）。 */
function onSelectNode(node) {
  if (hasDragged) return       // 拖拽过，不是点击
  if (!isMovable(node)) return
  emit('select-node', node)
}

const props = defineProps({
  playerGX: { type: Number, default: 0 },   // 玩家所在节点 gx（初始视口中心）
  playerGY: { type: Number, default: 0 },
  playerNetId: { type: Number, default: null },  // 玩家所在节点 id（高亮用）
  line: { type: Array, default: null },     // 移动路径段结构 [{start,end,startTime,endTime}]
  currentSeg: { type: Number, default: 0 }, // 当前段索引（0起），区分已走/当前/未走
  moving: { type: Boolean, default: false }, // 玩家是否正在移动中（移动中不可发起新移动）
})
const emit = defineEmits(['close', 'select-node'])

// —— 渲染常量 ——
const CELL = 48                  // 每格像素（世界坐标 → 像素）
const W = 640                    // 视口宽
const H = 480                    // 视口高
const CHUNK = 7                  // 每块覆盖的网格数（7×7）
const MARGIN = 1                 // 视口外多渲染的格数（避免边缘节点图标半切）

// —— 状态 ——
const offsetX = ref(0)           // 视口左上角对应的世界像素 X
const offsetY = ref(0)
const nodes = reactive(new Map())      // id → node（所有已加载节点，增量合并）
const edges = reactive(new Map())      // "from-to" → {fromId,toId}（已加载边，去重）
const loadedChunks = reactive(new Set()) // "cx,cy" 已加载区块缓存
const loading = ref(false)

// 拖动状态
let dragging = false
let dragStartX = 0
let dragStartY = 0
let dragStartOffsetX = 0
let dragStartOffsetY = 0

// —— 坐标换算 ——
function worldX(gx) { return gx * CELL }
function worldY(gy) { return gy * CELL }
function screenX(gx) { return worldX(gx) - offsetX.value }
function screenY(gy) { return worldY(gy) - offsetY.value }

// 区块坐标（Math.floor 正确处理负数）
function chunkOf(n) { return Math.floor(n / CHUNK) }
function chunkKey(cx, cy) { return cx + ',' + cy }

// —— 虚拟化：只渲染视口内（含 MARGIN 缓冲）的节点 ——
const visibleNodes = computed(() => {
  const minGX = Math.floor(offsetX.value / CELL) - MARGIN
  const maxGX = Math.floor((offsetX.value + W) / CELL) + MARGIN
  const minGY = Math.floor(offsetY.value / CELL) - MARGIN
  const maxGY = Math.floor((offsetY.value + H) / CELL) + MARGIN
  const out = []
  for (const n of nodes.values()) {
    if (n.gx >= minGX && n.gx <= maxGX && n.gy >= minGY && n.gy <= maxGY) {
      out.push(n)
    }
  }
  return out
})

// 可见边：两端节点都可见才画（避免画到视口外的断线）
const visibleEdges = computed(() => {
  const visibleIds = new Set(visibleNodes.value.map((n) => n.id))
  const out = []
  for (const e of edges.values()) {
    if (visibleIds.has(e.fromId) && visibleIds.has(e.toId)) {
      const a = nodes.get(e.fromId)
      const b = nodes.get(e.toId)
      if (a && b) out.push({ from: a, to: b })
    }
  }
  return out
})

// 移动路径折线段：line 是段结构 [{start, end, startTime, endTime}]。
// 每段标记 state：done=已走过、current=当前段、pending=未走。
// 已走过的段玩家位置已推进，currentNetId 之后到起点之间的段是 done。
const lineSegments = computed(() => {
  const ln = props.line
  if (!Array.isArray(ln) || !ln.length) return []
  const cur = props.currentSeg
  const segs = []
  for (let i = 0; i < ln.length; i++) {
    const seg = ln[i]
    if (!seg?.start || !seg?.end) continue
    segs.push({
      x1: worldX(seg.start.gx) - offsetX.value,
      y1: worldY(seg.start.gy) - offsetY.value,
      x2: worldX(seg.end.gx) - offsetX.value,
      y2: worldY(seg.end.gy) - offsetY.value,
      state: i < cur ? 'done' : i === cur ? 'current' : 'pending',
    })
  }
  return segs
})

// —— 区块加载：把缺失区块合并请求后端，增量合并结果 ——
async function loadChunksInRange(minCX, minCY, maxCX, maxCY) {
  // 收集未加载的区块
  const missing = []
  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cy = minCY; cy <= maxCY; cy++) {
      const k = chunkKey(cx, cy)
      if (!loadedChunks.has(k)) {
        missing.push({ cx, cy, k })
      }
    }
  }
  if (!missing.length) return
  // 标记为已加载（先标记防并发重复请求）
  for (const m of missing) loadedChunks.add(m.k)
  // 算这些区块覆盖的 gx/gy 范围
  const minGX = Math.min(...missing.map((m) => m.cx * CHUNK))
  const maxGX = Math.max(...missing.map((m) => (m.cx + 1) * CHUNK - 1))
  const minGY = Math.min(...missing.map((m) => m.cy * CHUNK))
  const maxGY = Math.max(...missing.map((m) => (m.cy + 1) * CHUNK - 1))

  loading.value = true
  try {
    const data = await getNodesInBBox(minGX, minGY, maxGX, maxGY)
    // 增量合并：Map.set 覆盖同 id，不重建（无闪屏）
    for (const n of data.nodes || []) nodes.set(n.id, n)
    for (const e of data.edges || []) {
      const ek = Math.min(e.from_id, e.to_id) + '-' + Math.max(e.from_id, e.to_id)
      edges.set(ek, { fromId: e.from_id, toId: e.to_id })
    }
  } catch (err) {
    // 失败则回退区块标记，允许下次重试
    for (const m of missing) loadedChunks.delete(m.k)
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '地图加载失败' })
  } finally {
    loading.value = false
  }
}

// 视口当前覆盖的区块范围 → 触发加载
function loadVisibleChunks() {
  const minGX = Math.floor(offsetX.value / CELL)
  const maxGX = Math.floor((offsetX.value + W) / CELL)
  const minGY = Math.floor(offsetY.value / CELL)
  const maxGY = Math.floor((offsetY.value + H) / CELL)
  loadChunksInRange(chunkOf(minGX), chunkOf(minGY), chunkOf(maxGX), chunkOf(maxGY))
}

// —— 拖动 ——
const viewportEl = ref(null)
// 拖拽位移检测：pointerdown 记起点，move 超阈值则标记 hasDragged，
// 节点 click 据此判断——拖拽过则忽略点击（避免拖动地图误触发节点移动）。
const DRAG_THRESHOLD = 4   // 超过 4px 视为拖拽（非点击）
let hasDragged = false
let downNodeId = null      // pointerdown 时点中的节点 id（capture 前 target 真实）
function onPointerDown(e) {
  dragging = true
  hasDragged = false
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartOffsetX = offsetX.value
  dragStartOffsetY = offsetY.value
  // pointerdown 时 target 是真实点击元素（setPointerCapture 前），记录是否点中节点
  const el = e.target instanceof Element ? e.target.closest('[data-node-id]') : null
  downNodeId = el ? Number(el.dataset.nodeId) : null
  viewportEl.value?.setPointerCapture(e.pointerId)
}
function onPointerMove(e) {
  if (!dragging) return
  // 位移超阈值则标记为拖拽（本次 pointerup 后的 click 应忽略）
  if (Math.abs(e.clientX - dragStartX) > DRAG_THRESHOLD ||
      Math.abs(e.clientY - dragStartY) > DRAG_THRESHOLD) {
    hasDragged = true
  }
  offsetX.value = dragStartOffsetX - (e.clientX - dragStartX)
  offsetY.value = dragStartOffsetY - (e.clientY - dragStartY)
  // 拖动中实时检查新进入视口的区块（缓存命中则不发请求）
  loadVisibleChunks()
}
function onPointerUp(e) {
  dragging = false
  viewportEl.value?.releasePointerCapture(e.pointerId)
  loadVisibleChunks()   // 松手后再确保加载一次
  // 纯点击（未拖拽）：用 pointerdown 时记录的节点（capture 前 target 真实）
  if (!hasDragged && downNodeId != null) {
    const node = nodes.get(downNodeId)
    if (node) onSelectNode(node)
  }
  downNodeId = null
}

// —— 挂载：以玩家位置为视口中心，加载初始区块 ——
onMounted(() => {
  // 视口中心 = 玩家世界像素；offsetX = 中心 - 视口宽/2
  offsetX.value = worldX(props.playerGX) - W / 2
  offsetY.value = worldY(props.playerGY) - H / 2
  loadVisibleChunks()
})
onUnmounted(() => { dragging = false })
</script>

<template>
    <Dlg title="大地图" :content-style-prop="{ width: W + 'px', height: H + 'px' }" @close="emit('close')">
        <div
            ref="viewportEl"
            class="world-map-viewport"
            :class="{ dragging }"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @dragstart.prevent
        >
            <!-- 连线层（SVG，铺满视口） -->
            <svg class="world-map-edges" :width="W" :height="H">
                <line v-for="(e, i) in visibleEdges" :key="i"
                    :x1="screenX(e.from.gx)" :y1="screenY(e.from.gy)"
                    :x2="screenX(e.to.gx)" :y2="screenY(e.to.gy)"
                    stroke="#8a7a5a" stroke-width="2" />
                <!-- 移动路径：按段状态分色（已走过实金/当前亮金粗/未走浅金虚线） -->
                <line v-for="(s, i) in lineSegments" :key="'L'+i"
                    :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2"
                    :stroke="s.state === 'done' ? '#c89020' : s.state === 'current' ? '#f0c040' : 'rgba(240,192,64,0.4)'"
                    :stroke-width="s.state === 'current' ? 4 : 3"
                    :stroke-dasharray="s.state === 'pending' ? '5,4' : 'none'" />
            </svg>
            <!-- 节点：点击由视口 pointerup 统一判断（data-node-id 标记，避免 @click 与拖拽冲突） -->
            <div
                v-for="n in visibleNodes"
                :key="n.id"
                class="world-map-node"
                :class="{ current: n.id === playerNetId, movable: isMovable(n) }"
                :data-node-id="n.id"
                :style="{ left: screenX(n.gx) + 'px', top: screenY(n.gy) + 'px' }"
                v-tooltip="n.name"
            >
                <img class="world-map-node-icon" :src="locIcon(n)" :alt="n.name">
                <span class="world-map-node-label">{{ n.name }}</span>
            </div>
            <!-- 加载指示 -->
            <div v-if="loading" class="world-map-loading">加载中...</div>
        </div>
    </Dlg>
</template>

<style lang="less" scoped>
.world-map-viewport{
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--panel-bg);
    background-image:
        linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px);
    background-size: 48px 48px;       /* 网格背景，与 CELL 对齐，增强拖动感 */
    user-select: none;
    -webkit-user-drag: none;          /* 禁止元素原生拖拽（img 等），避免抢占 pointer 事件 */
    touch-action: none;               /* 阻止触摸滚动，保证 pointer 拖动 */
}
/* 视口内所有元素禁止原生拖拽（img 默认可拖，会打断地图拖拽和点击） */
.world-map-viewport *{
    -webkit-user-drag: none;
}
.world-map-viewport.dragging{
    cursor: grabbing;
}
.world-map-viewport:not(.dragging){
    cursor: grab;
}
/* SVG 连线层：绝对定位铺满，不挡 pointer 事件 */
.world-map-edges{
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
}
/* 节点：以坐标点为中心，图标 + 下方名字标签 */
.world-map-node{
    position: absolute;
    transform: translate(-50%, -50%);
    width: 32px;
    height: 32px;
    pointer-events: auto;
}
.world-map-node-icon{
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
}
/* 名字标签：绝对定位在图标正下方，不撑大节点容器（避免影响拖动命中与坐标居中） */
.world-map-node-label{
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 2px;
    padding: 0 3px;
    background: rgba(233, 229, 220, 0.85);
    color: var(--text-dark);
    font-size: 10px;
    line-height: 14px;
    white-space: nowrap;
    border-radius: 2px;
    pointer-events: none;            /* 标签不挡拖动 */
}
/* 玩家当前位置：金色光晕 */
.world-map-node.current .world-map-node-icon{
    filter: drop-shadow(0 0 6px rgba(240, 192, 64, 1)) drop-shadow(0 0 3px rgba(200, 0, 0, 0.8));
}
.world-map-node.current .world-map-node-label{
    color: var(--accent);
    font-weight: bold;
}
/* 可点击移动的节点：绿色光晕提示 + pointer */
.world-map-node.movable{
    cursor: pointer;
}
.world-map-node.movable .world-map-node-icon{
    filter: drop-shadow(0 0 3px rgba(80, 200, 120, 0.8));
}
.world-map-node.movable:hover .world-map-node-icon{
    filter: drop-shadow(0 0 6px rgba(80, 200, 120, 1));
}
.world-map-loading{
    position: absolute;
    top: 8px;
    right: 8px;
    padding: 2px 8px;
    background: var(--tooltip-bg);
    color: var(--tooltip-border);
    font-size: var(--fs-xs);
    border-radius: 2px;
    pointer-events: none;
}
</style>
