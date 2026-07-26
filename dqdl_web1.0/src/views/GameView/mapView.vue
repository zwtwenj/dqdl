<script setup>
import { ref, computed, onMounted } from 'vue'
import { getPlayerView } from '@/api/mapdemo'
import { bus, BusEvents } from '@/utils/eventBus'

const view = ref(null)          // getPlayerView 返回：{ ring0, ring1, nodes, edges, fog }
const selected = ref(null)      // 右侧展示的节点（默认 ring0）
const loading = ref(false)
const error = ref('')

// —— 坐标映射：把节点的 gx/gy 线性映射到画布像素坐标 ——
const PAD = 26                  // 画布四周留白
const CANVAS_W = 358 - PAD * 2  // .map-view-left 宽 360 减边框/留白后的可用宽
const CANVAS_H = 290 - PAD * 2  // .map-view-left-location 高 290 减留白

const bounds = computed(() => {
  const nodes = view.value?.nodes || []
  if (!nodes.length) return null
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.gx < minX) minX = n.gx
    if (n.gx > maxX) maxX = n.gx
    if (n.gy < minY) minY = n.gy
    if (n.gy > maxY) maxY = n.gy
  }
  return { minX, maxX, minY, maxY, spanX: Math.max(1, maxX - minX), spanY: Math.max(1, maxY - minY) }
})

/** 节点坐标 → 画布像素 { left, top }（已含 PAD 偏移） */
function nodePos(node) {
  const b = bounds.value
  if (!b) return { left: 0, top: 0 }
  const x = ((node.gx - b.minX) / b.spanX) * CANVAS_W + PAD
  const y = ((node.gy - b.minY) / b.spanY) * CANVAS_H + PAD
  return { left: x, top: y }
}

// 节点 id → 坐标，便于画边
const nodeMap = computed(() => {
  const map = {}
  for (const n of view.value?.nodes || []) map[n.id] = n
  return map
})

const edges = computed(() => {
  const b = bounds.value
  if (!b) return []
  const map = nodeMap.value
  return (view.value?.edges || []).map((e, i) => {
    const a = map[e.from_id ?? e.fromId ?? e.from]
    const c = map[e.to_id ?? e.toId ?? e.to]
    if (!a || !c) return null
    const pa = nodePos(a)
    const pc = nodePos(c)
    return { id: i, x1: pa.left, y1: pa.top, x2: pc.left, y2: pc.top }
  }).filter(Boolean)
})

const ring0Id = computed(() => view.value?.ring0?.id)

function isCurrent(node) {
  return ring0Id.value != null && node.id === ring0Id.value
}

function onSelectNode(node) {
  selected.value = node
}

onMounted(async () => {
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
                <!-- 网状地图：SVG 连线 + 绝对定位节点 -->
                <svg class="map-edges" v-if="bounds">
                    <line v-for="e in edges" :key="e.id"
                        :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2"
                        stroke="#8a7a5a" stroke-width="1.5" />
                </svg>
                <div
                    v-for="node in view?.nodes"
                    :key="node.id"
                    class="map-node"
                    :class="{ current: isCurrent(node), selected: selected?.id === node.id }"
                    :style="nodePos(node)"
                    :title="node.name"
                    @click="onSelectNode(node)"
                ></div>
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
            <!-- 场景列表等其它内容暂不接入 -->
            <div class="scene-list">
                <div class="scene-empty">场景待接入</div>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.map-view{
    display: flex;
    width: 100%;
    gap: 10px;
}
.map-view-left{
    border: 1px solid #847375;
    width: 360px;
}
.map-view-left-title{
    background: url("/static/field-title-bg.gif") repeat-x;
    display: flex;
    .map-view-left-title-text{
        flex: 1;
        text-align: center;
        color: #e9e5dc;
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
    border: 1px solid #847375;
    margin: 1px;
    background: #efe9df;         /* 网格底色，让节点更清晰 */
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
/* 网状节点 */
.map-node{
    position: absolute;
    width: 14px;
    height: 14px;
    margin-left: -7px;          /* 以坐标点为中心 */
    margin-top: -7px;
    background: #6a5a3a;
    border: 1px solid #3a2f1a;
    border-radius: 2px;
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
}
.map-node:hover{
    transform: scale(1.25);
}
.map-node.selected{
    background: #a08040;
    box-shadow: 0 0 0 2px rgba(240, 192, 64, 0.6);
}
.map-node.current{
    background: #f0c040;
    border-color: #c80000;
    box-shadow: 0 0 8px 2px rgba(240, 192, 64, 0.9);
}
.map-empty{
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #8a7a5a;
    font-size: 13px;
}
.map-view-right{
    flex: 1;
    border: 1px solid #c3b8b1;
    background: #f5f2ea url("/static/field-box-bg.gif") repeat-x;
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
                color: #eb37a1;
                cursor: pointer;
                text-decoration: underline;
            }
        }
    }
    .location-description{
        margin-bottom: 10px;
    }
    .scene-list{
        .scene-empty{
            color: #b0a89e;
            font-style: italic;
        }
    }
}
</style>
