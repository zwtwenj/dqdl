<script setup>
/**
 * 网状地图 + 场景 可视化（接入真实 location_net / location_scene 表）。
 * -----------------------------------------------
 * - 网格坐标 (gx,gy) → 屏幕：x = ox + gx*CELL*s，y = oy - gy*CELL*s
 * - 拖拽空白 = 平移；滚轮 = 缩放；点节点 = 选中并看出口
 * - 玩家位置用金色大圆点高亮；点击 open 出口可移动过去
 * - 选中 city 节点时右侧显示场景列表，可进/退场景
 */
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import {
  getPlayerView,
  getMapExits,
  getMapScenes,
  expandFrontier,
  getPlayerPos,
  moveToNet,
  enterScene,
  exitScene,
} from '../api/mapdemo'

const canvasRef = ref(null)
const selectedId = ref(null)
const exits = ref([])
const scenes = ref([])
const hint = ref('')
const busy = ref(false)
const stats = ref({ nodes: 0, edges: 0 })

// 玩家位置：net_id（当前地图）、scene_id（当前场景，null=在地图上）
const playerNetId = ref(null)
const playerSceneId = ref(null)
const playerSceneName = ref('')

// 视图变换
const CELL = 110
let ox = 0
let oy = 0
let scale = 1

let nodes = []
let edges = []
let fog = [] // ring2 迷雾出口：{from_gx, from_gy, direction, direction_cn}
let dragView = null
let hoverId = null
let ctx = null
let width = 0
let height = 0
let rafId = null

// ---------- 数据加载 ----------
async function loadAll() {
  await Promise.all([loadView(), loadPos()])
  if (selectedId.value == null && playerNetId.value != null) {
    await selectNode(playerNetId.value)
  }
}

async function loadView() {
  const data = await getPlayerView()
  nodes = data.nodes
  edges = data.edges
  fog = data.fog || []
  stats.value = { nodes: nodes.length, edges: edges.length, fog: fog.length }
}

async function loadPos() {
  const p = await getPlayerPos()
  playerNetId.value = p.net_id
  playerSceneId.value = p.scene_id ?? null
  playerSceneName.value = p.scene?.name ?? ''
}

async function selectNode(id) {
  selectedId.value = id
  const [ex, sc] = await Promise.all([getMapExits(id), getMapScenes(id)])
  exits.value = ex
  scenes.value = sc
}

// ---------- 动作 ----------
async function onExpand(direction) {
  if (!selectedId.value || busy.value) return
  busy.value = true
  hint.value = '探查中…迷雾正在散去'
  try {
    const r = await expandFrontier(selectedId.value, direction)
    hint.value = `向${r.direction_cn}探查：发现 ${r.new_node.name}（${r.new_node.loc_type}）`
    await loadGraph()
    await selectNode(selectedId.value)
  } catch (e) {
    hint.value = '探查失败：' + (e.message || e)
  } finally {
    busy.value = false
    setTimeout(() => (hint.value = ''), 3000)
  }
}

async function onMove(netId) {
  if (busy.value) return
  busy.value = true
  try {
    const r = await moveToNet(netId)
    hint.value = r.new_nodes?.length
      ? `已移动，新发现 ${r.new_nodes.length} 处地点`
      : '已移动'
    await Promise.all([loadView(), loadPos()])
    await selectNode(netId)
  } catch (e) {
    hint.value = '移动失败：' + (e.message || e)
  } finally {
    busy.value = false
    setTimeout(() => (hint.value = ''), 3000)
  }
}

async function onEnterScene(sceneType) {
  if (!selectedId.value || busy.value) return
  busy.value = true
  try {
    await enterScene(selectedId.value, sceneType)
    hint.value = '进入场景'
    await loadPos()
  } catch (e) {
    hint.value = '进入失败：' + (e.message || e)
  } finally {
    busy.value = false
    setTimeout(() => (hint.value = ''), 3000)
  }
}

async function onExitScene() {
  if (busy.value) return
  busy.value = true
  try {
    await exitScene()
    hint.value = '退出场景，回到地图'
    await loadPos()
  } catch (e) {
    hint.value = '退出失败：' + (e.message || e)
  } finally {
    busy.value = false
    setTimeout(() => (hint.value = ''), 3000)
  }
}

// ---------- 绘制 ----------
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
  drawAxis()
  drawEdges()
  drawFog()
  drawNodes()
}

function drawGrid() {
  const step = CELL * scale
  if (step < 24) return
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
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

function drawAxis() {
  ctx.fillStyle = 'rgba(212,175,106,0.5)'
  ctx.font = '10px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('origin(0,0)', g2sx(0) + 8, g2sy(0) - 8)
}

function drawEdges() {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  for (const e of edges) {
    const a = nodeMap.get(e.from_id)
    const b = nodeMap.get(e.to_id)
    if (!a || !b) continue
    const isHi =
      selectedId.value === a.id ||
      selectedId.value === b.id ||
      playerNetId.value === a.id ||
      playerNetId.value === b.id
    ctx.strokeStyle = isHi ? 'rgba(212,175,106,0.9)' : 'rgba(180,170,150,0.4)'
    ctx.lineWidth = isHi ? 2.5 : 1.2
    ctx.beginPath()
    ctx.moveTo(g2sx(a.gx), g2sy(a.gy))
    ctx.lineTo(g2sx(b.gx), g2sy(b.gy))
    ctx.stroke()
    if (isHi) {
      const mx = (g2sx(a.gx) + g2sx(b.gx)) / 2
      const my = (g2sy(a.gy) + g2sy(b.gy)) / 2
      ctx.fillStyle = '#a09888'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`${e.distance}里`, mx, my - 4)
    }
  }
}

// 迷雾出口（ring2 未生成）：在对应网格位画半透明灰雾 + ?
function drawFog() {
  const DIR_VEC = {
    NE: [1, 1], NW: [-1, 1], SE: [1, -1], SW: [-1, -1],
  }
  for (const f of fog) {
    const v = DIR_VEC[f.direction] || [1, 1]
    const gx = f.from_gx + v[0]
    const gy = f.from_gy + v[1]
    const x = g2sx(gx)
    const y = g2sy(gy)
    const r = 14 * Math.max(0.7, scale)
    // 雾团底
    ctx.beginPath()
    ctx.arc(x, y, r + 4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(120,120,140,0.18)'
    ctx.fill()
    // 虚线圈
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(160,160,180,0.5)'
    ctx.setLineDash([3, 3])
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.setLineDash([])
    // 问号
    ctx.fillStyle = 'rgba(180,180,200,0.7)'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('?', x, y + 5)
  }
}

function drawNodes() {
  for (const n of nodes) {
    const x = g2sx(n.gx)
    const y = g2sy(n.gy)
    const sel = selectedId.value === n.id
    const hov = hoverId === n.id
    const isPlayer = playerNetId.value === n.id
    const r = (sel ? 18 : hov ? 16 : 14) * Math.max(0.7, scale)

    // frontier 脉冲
    if (n.is_frontier) {
      const pulse = 4 + Math.sin(Date.now() / 300) * 3
      ctx.beginPath()
      ctx.arc(x, y, r + pulse, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(212,175,106,0.14)'
      ctx.fill()
    }

    // 玩家位置外环（金色双环）
    if (isPlayer) {
      ctx.beginPath()
      ctx.arc(x, y, r + 7, 0, Math.PI * 2)
      ctx.strokeStyle = '#f5d76e'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = colorOfType(n.loc_type)
    ctx.fill()
    ctx.lineWidth = sel ? 3.5 : isPlayer ? 2.5 : n.is_frontier ? 2 : 1.5
    ctx.strokeStyle = isPlayer ? '#f5d76e' : n.is_frontier ? '#d4af6a' : '#3a3a3a'
    ctx.stroke()

    if (scale > 0.6) {
      ctx.fillStyle = sel ? '#e8d5a0' : '#e8e0d0'
      ctx.font = `${sel || isPlayer ? 'bold ' : ''}12px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(n.name, x, y + r + 14)
    }
    if (sel) {
      ctx.fillStyle = '#666'
      ctx.font = '10px monospace'
      ctx.fillText(`(${n.gx},${n.gy})`, x, y + r + 28)
    }
  }
}

// ---------- 命中 ----------
function nodeAt(x, y) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    const r = 16 * Math.max(0.7, scale)
    if (Math.hypot(g2sx(n.gx) - x, g2sy(n.gy) - y) <= r) return n
  }
  return null
}

// ---------- 交互 ----------
function onDown(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const n = nodeAt(x, y)
  if (n) {
    selectNode(n.id)
  } else {
    dragView = { x, y, ox, oy }
  }
}
function onCanvasMove(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  hoverId = nodeAt(x, y)?.id ?? null
  if (dragView) {
    ox = dragView.ox + (x - dragView.x)
    oy = dragView.oy + (y - dragView.y)
  }
}
function onUp() {
  dragView = null
}
function onWheel(e) {
  e.preventDefault()
  const rect = canvasRef.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const gx = (x - ox) / (CELL * scale)
  const gy = (oy - y) / (CELL * scale)
  scale *= e.deltaY < 0 ? 1.1 : 0.9
  scale = Math.max(0.4, Math.min(2.5, scale))
  ox = x - gx * CELL * scale
  oy = y + gy * CELL * scale
}

function tick() {
  draw()
  rafId = requestAnimationFrame(tick)
}
function resize() {
  const c = canvasRef.value
  if (!c) return
  const parent = c.parentElement
  width = parent.clientWidth
  height = parent.clientHeight
  c.width = width
  c.height = height
}

onMounted(async () => {
  await nextTick()
  resize()
  ox = width / 2
  oy = height / 2
  ctx = canvasRef.value.getContext('2d')
  await loadAll()
  canvasRef.value.addEventListener('mousedown', onDown)
  canvasRef.value.addEventListener('mousemove', onCanvasMove)
  canvasRef.value.addEventListener('wheel', onWheel, { passive: false })
  window.addEventListener('mouseup', onUp)
  window.addEventListener('resize', resize)
  rafId = requestAnimationFrame(tick)
})

onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('mouseup', onUp)
  window.removeEventListener('resize', resize)
})

// ---------- 模板辅助 ----------
const DIR_ORDER = ['NE', 'NW', 'SE', 'SW']
const sortedExits = () =>
  [...exits.value].sort(
    (a, b) => DIR_ORDER.indexOf(a.direction) - DIR_ORDER.indexOf(b.direction),
  )
const selectedNode = () => nodes.find((n) => n.id === selectedId.value)
const travelTypeCn = (t) =>
  ({ road: '官道', wild: '野外小径', mountain: '山路', secret: '秘径' }[t] || t)
const sceneIcon = (t) =>
  ({
    guild: '⚔️',
    market: '🪙',
    alchemy: '⚗️',
    auction: '🔨',
    cultivation: '🧘',
  }[t] || '📍')
const playerNode = () => nodes.find((n) => n.id === playerNetId.value)
</script>

<template>
  <div class="mapdemo">
    <header class="topbar">
      <h2>网状地图 + 场景</h2>
      <span class="sub">X 形对角网格 · 拖拽平移 · 滚轮缩放 · 点节点看出口/场景</span>
      <span class="stats">可见 {{ stats.nodes }} · 迷雾 {{ stats.fog || 0 }}</span>
      <span class="pos">
        当前地图：<b>{{ playerNode()?.name || '—' }}</b>
        <template v-if="playerSceneName">
          ｜ 场景：<b class="scene-name">{{ playerSceneName }}</b>
        </template>
      </span>
      <span class="hint" v-if="hint">{{ hint }}</span>
    </header>

    <div class="body">
      <div class="canvas-wrap">
        <canvas ref="canvasRef"></canvas>
        <div class="legend">
          <span><i class="dot city"></i>城市</span>
          <span><i class="dot wild"></i>野外</span>
          <span><i class="dot sect"></i>宗派</span>
          <span><i class="dot secret"></i>秘境</span>
          <span class="sep">|</span>
          <span class="front-mark">● frontier</span>
          <span class="player-mark">◎ 玩家位置</span>
        </div>
      </div>

      <aside class="panel">
        <!-- 当前节点信息 -->
        <div v-if="selectedNode()" class="cur">
          <div class="cur-name">{{ selectedNode().name }}</div>
          <div class="cur-meta">
            <span class="tag">{{ selectedNode().loc_type }}</span>
            <span class="tag front" v-if="selectedNode().is_frontier">frontier</span>
            <span class="tag player" v-if="playerNetId === selectedNode().id">玩家所在</span>
            <span class="coord">({{ selectedNode().gx }}, {{ selectedNode().gy }})</span>
          </div>
          <div class="cur-desc" v-if="selectedNode().description">{{ selectedNode().description }}</div>
          <div class="cur-extra" v-if="selectedNode().loc_type === 'wild'">
            危险 {{ selectedNode().danger_level }} · 斗气浓郁 {{ selectedNode().qi_density }}
          </div>
        </div>

        <!-- 出口 -->
        <h3>出口（4 对角方向）</h3>
        <ul class="exits">
          <li v-for="e in sortedExits()" :key="e.edge_id" :class="['exit', e.status]">
            <div class="exit-head">
              <span class="dir">{{ e.direction_cn }}</span>
              <span class="status" :data-st="e.status">
                {{ e.status === 'open' ? '已连通' : '未知边缘' }}
              </span>
            </div>
            <div class="exit-body">
              <template v-if="e.status === 'open' && e.to">
                → {{ e.to.name }}（{{ e.to.loc_type }}）· {{ e.distance }}里 · {{ travelTypeCn(e.travel_type) }}
              </template>
              <template v-else>一片迷雾，尚未探查</template>
            </div>
            <div class="exit-btns">
              <button
                v-if="e.status === 'open' && e.to"
                class="btn-move"
                :disabled="busy || playerNetId === e.to.id"
                @click="onMove(e.to.id)"
              >
                {{ playerNetId === e.to.id ? '已在此处' : '前往 →' }}
              </button>
              <button
                v-if="e.status === 'unknown'"
                class="btn-explore"
                :disabled="busy"
                @click="onExpand(e.direction)"
              >
                {{ busy ? '探查中…' : '探查 →' }}
              </button>
            </div>
          </li>
        </ul>

        <!-- 场景（仅城市） -->
        <template v-if="selectedNode() && selectedNode().loc_type === 'city'">
          <h3>城内场景</h3>
          <ul class="scenes">
            <li
              v-for="s in scenes"
              :key="s.id"
              :class="['scene', { active: playerSceneId === s.id }]"
            >
              <div class="scene-head">
                <span class="scene-icon">{{ sceneIcon(s.scene_type) }}</span>
                <span class="scene-name">{{ s.name }}</span>
                <span class="scene-type">{{ s.scene_type }}</span>
              </div>
              <div class="scene-desc" v-if="s.description">{{ s.description }}</div>
              <div class="scene-actions" v-if="s.available_actions?.length">
                可做：{{ s.available_actions.join(' / ') }}
              </div>
              <button
                v-if="playerSceneId !== s.id"
                class="btn-enter"
                :disabled="busy || playerNetId !== selectedNode().id"
                @click="onEnterScene(s.scene_type)"
              >
                {{ playerNetId !== selectedNode().id ? '需先到达此城' : '进入 →' }}
              </button>
              <button v-else class="btn-exit" :disabled="busy" @click="onExitScene">
                退出场景 ←
              </button>
            </li>
          </ul>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.mapdemo {
  width: 1200px;
  height: 100vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  background: var(--bg-base);
  color: var(--text);
}
.topbar {
  padding: 10px 20px;
  border-bottom: 1px solid #2a2a35;
  background: #12121a;
  display: flex;
  align-items: baseline;
  gap: 16px;
  flex-wrap: wrap;
}
.topbar h2 {
  font-size: 17px;
  color: var(--gold);
}
.topbar .sub {
  font-size: 12px;
  color: var(--text-muted);
}
.topbar .stats {
  font-size: 12px;
  color: var(--gold-bright);
  font-family: monospace;
}
.topbar .pos {
  font-size: 13px;
  color: var(--text);
}
.topbar .pos b {
  color: var(--gold-bright);
}
.topbar .pos .scene-name {
  color: #f5d76e;
}
.topbar .hint {
  font-size: 12px;
  color: var(--gold-bright);
}
.body {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.canvas-wrap {
  flex: 1;
  position: relative;
}
.canvas-wrap canvas {
  display: block;
  cursor: grab;
}
.canvas-wrap canvas:active {
  cursor: grabbing;
}
.legend {
  position: absolute;
  left: 12px;
  bottom: 12px;
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
  background: rgba(0, 0, 0, 0.5);
  padding: 6px 10px;
  border-radius: 4px;
}
.legend .dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}
.legend .sep {
  color: #444;
}
.front-mark {
  color: var(--gold);
}
.player-mark {
  color: #f5d76e;
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

.panel {
  width: 360px;
  border-left: 1px solid #2a2a35;
  background: #101018;
  padding: 16px;
  overflow-y: auto;
}
.cur-name {
  font-size: 20px;
  color: var(--gold-bright);
  font-weight: bold;
}
.cur-meta {
  margin: 6px 0;
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}
.tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 8px;
  background: #2a2a35;
  color: var(--text-muted);
}
.tag.front {
  background: rgba(212, 175, 106, 0.2);
  color: var(--gold);
  border: 1px solid var(--gold);
}
.tag.player {
  background: rgba(245, 215, 110, 0.2);
  color: #f5d76e;
  border: 1px solid #f5d76e;
}
.coord {
  font-size: 11px;
  color: #666;
  font-family: monospace;
  margin-left: auto;
}
.cur-desc {
  font-size: 13px;
  color: var(--text);
  margin: 8px 0;
  line-height: 1.5;
}
.cur-extra {
  font-size: 12px;
  color: var(--text-muted);
}
.panel h3 {
  font-size: 14px;
  color: var(--gold);
  margin: 18px 0 10px;
  border-top: 1px solid #2a2a35;
  padding-top: 14px;
}
.exits,
.scenes {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.exit {
  border: 1px solid #2a2a35;
  border-radius: 6px;
  padding: 8px 10px;
  background: #16161e;
}
.exit.unknown {
  border-color: rgba(212, 175, 106, 0.5);
  background: rgba(212, 175, 106, 0.06);
}
.exit-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.exit-head .dir {
  font-size: 13px;
  color: var(--gold-bright);
  font-weight: bold;
}
.exit-head .status[data-st='open'] {
  color: #9bd07a;
}
.exit-head .status[data-st='unknown'] {
  color: var(--gold);
}
.exit-head .status {
  font-size: 11px;
}
.exit-body {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 6px;
}
.exit-btns {
  display: flex;
  gap: 6px;
}
.btn-move,
.btn-explore,
.btn-enter,
.btn-exit {
  flex: 1;
  padding: 6px 0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.btn-move {
  border: 1px solid #7fb3ff;
  background: transparent;
  color: #7fb3ff;
}
.btn-move:hover:not(:disabled) {
  background: #7fb3ff;
  color: #0a0a0f;
}
.btn-explore {
  border: 1px solid var(--gold);
  background: transparent;
  color: var(--gold);
}
.btn-explore:hover:not(:disabled) {
  background: var(--gold);
  color: #0a0a0f;
}
.btn-enter {
  border: 1px solid #f5d76e;
  background: transparent;
  color: #f5d76e;
}
.btn-enter:hover:not(:disabled) {
  background: #f5d76e;
  color: #0a0a0f;
}
.btn-exit {
  border: 1px solid #c85a5a;
  background: transparent;
  color: #c85a5a;
}
.btn-exit:hover:not(:disabled) {
  background: #c85a5a;
  color: #0a0a0f;
}
.btn-move:disabled,
.btn-explore:disabled,
.btn-enter:disabled,
.btn-exit:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.scene {
  border: 1px solid #2a2a35;
  border-radius: 6px;
  padding: 10px;
  background: #16161e;
}
.scene.active {
  border-color: #f5d76e;
  background: rgba(245, 215, 110, 0.06);
}
.scene-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.scene-icon {
  font-size: 16px;
}
.scene-name {
  font-size: 14px;
  color: var(--gold-bright);
  font-weight: bold;
}
.scene-type {
  font-size: 10px;
  color: var(--text-muted);
  margin-left: auto;
  background: #2a2a35;
  padding: 1px 6px;
  border-radius: 6px;
}
.scene-desc {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  margin: 4px 0;
}
.scene-actions {
  font-size: 11px;
  color: #888;
  margin-bottom: 6px;
}
</style>
