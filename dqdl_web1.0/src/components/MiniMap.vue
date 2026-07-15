<script setup>
/**
 * 小地图面板弹窗：右上角「地图」按钮触发。
 *
 * 展示**已生成的全部地图**（getMapGraph 全图）+ 路线（对角邻接边）+ 玩家位置。
 * 复用 MapDemoView 的网格坐标变换：x = ox + gx*CELL*scale，y = oy - gy*CELL*scale。
 *
 * 与 MapDemoView 的区别：
 *   - 只读：仅展示，不提供移动/探查/进场景操作
 *   - 自适应：打开时按全部节点坐标范围自动 fit 到画布，玩家位置居中高亮
 *   - 仍支持拖拽平移 + 滚轮缩放（看局部细节）
 *
 * 暗金风格面板，复用 usePanelStack / usePanelDraggable。
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'
import { getMapGraph } from '../api/mapdemo'

const props = defineProps({
  modelValue: Boolean,
  /** 玩家当前所在地图节点 id（用于高亮玩家位置） */
  locationId: { type: Number, default: null },
  pos: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:pos'])

/* ============ 弹窗层级 + 拖拽 ============ */
const { z, focus, mount, unmount } = usePanelStack('minimap')
watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      mount()
      focus()
      nextTick(() => {
        resize()
        loadGraph()
      })
    } else {
      unmount()
    }
  },
)
onMounted(() => props.modelValue && mount())
onUnmounted(() => {
  unmount()
  stopRender()
})

const panelRef = ref(null)
const posModel = computed({
  get: () => props.pos,
  set: (v) => emit('update:pos', v),
})
const { dragging, onHandlePointerDown } = usePanelDraggable({
  elRef: panelRef,
  pos: posModel,
  onStart: focus,
})

/* ============ 画布 + 数据 ============ */
const canvasRef = ref(null)
let ctx = null
let width = 0
let height = 0
let rafId = null
let nodes = []
let edges = []
const loading = ref(false)

// 视图变换（fit 后可手动平移/缩放）
// CELL 放大三倍（110→330）：网格间距更大，地图名字显示更开
const CELL = 330
let ox = 0
let oy = 0
let scale = 1
let dragView = null

/** 拉全图 */
async function loadGraph() {
  loading.value = true
  try {
    const data = await getMapGraph()
    nodes = data.nodes || []
    edges = data.edges || []
    fitView()
  } catch (e) {
    nodes = []
    edges = []
  } finally {
    loading.value = false
  }
}

/**
 * 自适应：按全部节点坐标范围 fit 到画布，玩家位置尽量居中。
 * 找到 min/max gx/gy，算出合适的 scale 使全图可见。
 */
function fitView() {
  if (!nodes.length || !width || !height) return
  let minGx = Infinity,
    maxGx = -Infinity,
    minGy = Infinity,
    maxGy = -Infinity
  for (const n of nodes) {
    if (n.gx < minGx) minGx = n.gx
    if (n.gx > maxGx) maxGx = n.gx
    if (n.gy < minGy) minGy = n.gy
    if (n.gy > maxGy) maxGy = n.gy
  }
  const spanGx = Math.max(1, maxGx - minGx)
  const spanGy = Math.max(1, maxGy - minGy)
  // 留 padding
  const pad = 60
  const availW = width - pad * 2
  const availH = height - pad * 2
  // fit 出刚好塞满全图的 scale；下限 0.5 保证内容不过小（超出可拖拽平移查看）
  const sx = availW / (spanGx * CELL)
  const sy = availH / (spanGy * CELL)
  scale = Math.max(0.5, Math.min(1.5, Math.min(sx, sy)))
  // 居中：让节点范围的几何中心落在画布中心
  const cx = (minGx + maxGx) / 2
  const cy = (minGy + maxGy) / 2
  ox = width / 2 - cx * CELL * scale
  oy = height / 2 + cy * CELL * scale
}

/* ============ 绘制（复用 MapDemoView 逻辑） ============ */
function colorOfType(t) {
  return (
    {
      city: '#7fb3ff',
      wild: '#c8a35a',
      sect: '#d693f5',
      secret: '#f5d76e',
    }[t] || '#bbb'
  )
}
function g2sx(gx) {
  return ox + gx * CELL * scale
}
function g2sy(gy) {
  return oy - gy * CELL * scale
}

function draw() {
  if (!ctx) return
  ctx.clearRect(0, 0, width, height)
  drawGrid()
  drawEdges()
  drawNodes()
}

function drawGrid() {
  const step = CELL * scale
  if (step < 20) return
  ctx.strokeStyle = 'rgba(212,175,106,0.06)'
  ctx.lineWidth = 1
  const startX = ox - Math.floor(ox / step) * step
  for (let x = startX; x < width; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  const startY = oy - Math.floor(oy / step) * step
  for (let y = startY; y < height; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}

function drawEdges() {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  for (const e of edges) {
    const a = nodeMap.get(e.from_id)
    const b = nodeMap.get(e.to_id)
    if (!a || !b) continue
    const isPlayerEdge =
      props.locationId === a.id || props.locationId === b.id
    ctx.strokeStyle = isPlayerEdge
      ? 'rgba(245,215,110,0.9)'
      : 'rgba(180,150,90,0.35)'
    ctx.lineWidth = isPlayerEdge ? 2.2 : 1
    ctx.beginPath()
    ctx.moveTo(g2sx(a.gx), g2sy(a.gy))
    ctx.lineTo(g2sx(b.gx), g2sy(b.gy))
    ctx.stroke()
  }
}

function drawNodes() {
  // 节点半径与文字基于固定像素，避免 fitView 把 scale 缩小后内容过小。
  // scale 仅影响网格间距（每格像素），不影响节点/文字本身大小。
  const BASE_R = 9
  for (const n of nodes) {
    const x = g2sx(n.gx)
    const y = g2sy(n.gy)
    const isPlayer = props.locationId === n.id
    const r = isPlayer ? BASE_R + 3 : BASE_R

    // 玩家位置：金色脉冲外环
    if (isPlayer) {
      const pulse = 3 + Math.sin(Date.now() / 300) * 2
      ctx.beginPath()
      ctx.arc(x, y, r + pulse + 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(245,215,110,0.18)'
      ctx.fill()
      // 金色双环
      ctx.beginPath()
      ctx.arc(x, y, r + 5, 0, Math.PI * 2)
      ctx.strokeStyle = '#f5d76e'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // 节点底
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = colorOfType(n.loc_type)
    ctx.fill()
    ctx.lineWidth = isPlayer ? 2.5 : n.is_frontier ? 1.8 : 1.2
    ctx.strokeStyle = isPlayer ? '#f5d76e' : n.is_frontier ? '#d4af6a' : 'rgba(58,58,58,0.8)'
    ctx.stroke()

    // 节点名：始终显示（固定字号，确保地图名字清晰可读）
    ctx.fillStyle = isPlayer ? '#f5d76e' : '#e0d8c0'
    ctx.font = `${isPlayer ? 'bold ' : ''}13px 'STKaiti','KaiTi','楷体',serif`
    ctx.textAlign = 'center'
    ctx.fillText(n.name, x, y + r + 16)
  }
}

/* ============ 交互（拖拽平移 + 滚轮缩放，仅查看） ============ */
function onCanvasDown(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  dragView = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    ox,
    oy,
  }
}
function onCanvasMove(e) {
  if (!dragView) return
  const rect = canvasRef.value.getBoundingClientRect()
  ox = dragView.ox + (e.clientX - rect.left - dragView.x)
  oy = dragView.oy + (e.clientY - rect.top - dragView.y)
}
function onCanvasUp() {
  dragView = null
}
function onWheel(e) {
  e.preventDefault()
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const gx = (x - ox) / (CELL * scale)
  const gy = (oy - y) / (CELL * scale)
  scale *= e.deltaY < 0 ? 1.12 : 0.89
  scale = Math.max(0.25, Math.min(2.5, scale))
  ox = x - gx * CELL * scale
  oy = y + gy * CELL * scale
}

function tick() {
  draw()
  rafId = requestAnimationFrame(tick)
}
function startRender() {
  if (rafId) return
  rafId = requestAnimationFrame(tick)
}
function stopRender() {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = null
}

function resize() {
  const c = canvasRef.value
  if (!c) return
  const parent = c.parentElement
  width = parent.clientWidth
  height = parent.clientHeight
  c.width = width
  c.height = height
  ctx = c.getContext('2d')
}

/** 重新居中（玩家位置/全图） */
function onRecenter() {
  loadGraph()
}

watch(
  () => props.modelValue,
  (v) => {
    if (v) {
      // 面板渲染好后启动绘制循环
      nextTick(() => {
        resize()
        startRender()
      })
    } else {
      stopRender()
    }
  },
)

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <div
    v-if="modelValue"
    ref="panelRef"
    class="minimap-panel"
    :class="{ 'is-dragging': dragging }"
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
    @pointerdown="focus"
  >
    <!-- 顶部拖拽手柄 + 标题 -->
    <div
      class="panel-header drag-handle"
      title="拖拽移动"
      @pointerdown.stop="onHandlePointerDown"
    >
      <span class="panel-title">地图</span>
      <button
        class="header-act"
        type="button"
        title="重新居中"
        @click.stop="onRecenter"
      >
        ⟳
      </button>
    </div>

    <!-- 关闭按钮 -->
    <button
      class="close-btn"
      type="button"
      title="关闭"
      @click="close"
    >
      ×
    </button>

    <!-- 画布 -->
    <div class="canvas-wrap">
      <canvas
        ref="canvasRef"
        @mousedown="onCanvasDown"
        @mousemove="onCanvasMove"
        @mouseup="onCanvasUp"
        @mouseleave="onCanvasUp"
        @wheel.prevent="onWheel"
      />
      <div
        v-if="loading"
        class="loading-tip"
      >
        加载地图中...
      </div>
      <!-- 图例 -->
      <div class="legend">
        <span><i class="dot city" />城市</span>
        <span><i class="dot wild" />野外</span>
        <span><i class="dot sect" />宗派</span>
        <span><i class="dot secret" />秘境</span>
        <span class="sep">|</span>
        <span class="player-mark">◎ 你的位置</span>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.minimap-panel {
  position: absolute;
  right: 14px;
  top: 56px;
  width: 1000px;
  height: 600px;
  display: flex;
  flex-direction: column;
  padding: 10px 14px 14px;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.94), rgba(14, 11, 8, 0.96));
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.minimap-panel.is-dragging {
  user-select: none;
  -webkit-user-select: none;
}

.panel-header {
  position: relative;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(180, 150, 90, 0.3);
  cursor: move;
  user-select: none;
  -webkit-user-select: none;
}
.panel-title {
  font-size: 15px;
  letter-spacing: 6px;
  color: #f0d890;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.header-act {
  position: absolute;
  right: 34px;
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 15px;
  line-height: 1;
  color: rgba(220, 190, 120, 0.8);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(120, 100, 60, 0.4);
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    color: #f0d890;
    border-color: rgba(220, 190, 120, 0.7);
  }
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 3;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  color: rgba(220, 190, 120, 1);
  background: rgba(0, 0, 0, 0.6);
  border: none;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: serif;
  &:hover {
    color: #ff9080;
    background: rgba(60, 20, 15, 0.5);
  }
}

.canvas-wrap {
  flex: 1;
  position: relative;
  margin-top: 8px;
  background: rgba(8, 6, 4, 0.5);
  border: 1px solid rgba(120, 100, 60, 0.3);
  border-radius: 6px;
  overflow: hidden;
  canvas {
    display: block;
    cursor: grab;
    width: 100%;
    height: 100%;
    &:active {
      cursor: grabbing;
    }
  }
}

.loading-tip {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  letter-spacing: 2px;
  color: rgba(200, 170, 110, 0.6);
  background: rgba(8, 6, 4, 0.4);
}

.legend {
  position: absolute;
  left: 8px;
  bottom: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  font-size: 11px;
  color: rgba(200, 180, 140, 0.7);
  background: rgba(8, 6, 4, 0.7);
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid rgba(120, 100, 60, 0.25);
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 3px;
    vertical-align: middle;
  }
  .dot.city {
    background: #7fb3ff;
  }
  .dot.wild {
    background: #c8a35a;
  }
  .dot.sect {
    background: #d693f5;
  }
  .dot.secret {
    background: #f5d76e;
  }
  .sep {
    color: rgba(120, 100, 60, 0.5);
  }
  .player-mark {
    color: #f5d76e;
  }
}
</style>
