<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { getPlayerView, getMapScenes, moveToNet } from '@/api/mapdemo'
import Dlg from '@/components1/dlg.vue'
import { bus, BusEvents } from '@/utils/eventBus'

const view = ref(null)          // getPlayerView 返回：{ ring0, ring1, nodes, edges, fog }
const selected = ref(null)      // 右侧展示的节点（默认 ring0）
const loading = ref(false)
const error = ref('')

// —— 以 ring0 为中心的固定步长布局 ——
// 方向是 4 对角（NE/NW/SE/SW），每个网格步长固定 70px。
// 节点像素坐标 = 画布中心 + (gx - ring0.gx) * STEP / (gy - ring0.gy) * STEP。
// 这样当前点居中、4 个对角邻居对称散开，两格内（ring0+ring1+ring2）必然在画布内。
const STEP = 70
const CENTER_X = 179            // 画布宽 358 的中心
const CENTER_Y = 145            // 画布高 290 的中心

const ring0 = computed(() => view.value?.ring0 || null)

/** 节点 → 画布像素 { left, top }（以 ring0 为原点）。
 *  注意：left/top 必须带 'px' 单位，否则 Vue 渲染成纯数字会被浏览器忽略，
 *  节点全部塌缩到左上角(0,0)。 */
function nodePos(node) {
  const c = ring0.value
  if (!c || node.gx == null || node.gy == null || c.gx == null || c.gy == null) {
    return { left: CENTER_X + 'px', top: CENTER_Y + 'px' }
  }
  const dx = (node.gx - c.gx) * STEP
  const dy = (node.gy - c.gy) * STEP
  const left = CENTER_X + dx
  const top = CENTER_Y + dy
  // 防御 NaN/Infinity：异常时回退到中心
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return { left: CENTER_X + 'px', top: CENTER_Y + 'px' }
  }
  return { left: left + 'px', top: top + 'px' }
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
    const pa = nodePos(a)
    const pc = nodePos(c)
    return { id: i, x1: pa.left, y1: pa.top, x2: pc.left, y2: pc.top }
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
 *  与后端 movePlayer 的校验一致：|dx|==1 && |dy|==1 */
function isMovable(node) {
  const c = ring0.value
  if (!c || node.gx == null || node.gy == null) return false
  return Math.abs(node.gx - c.gx) === 1 && Math.abs(node.gy - c.gy) === 1
}

// 点击节点：对角邻居 → 弹移动确认；其他（自身/远点）→ 仅选中查看
function onSelectNode(node) {
  selected.value = node
  if (isMovable(node)) {
    moveTarget.value = node
    moveDlgVisible.value = true
  }
}

// —— 移动确认弹窗 ——
const moveDlgVisible = ref(false)
const moveTarget = ref(null)       // 待移动的目标节点
const moving = ref(false)          // 移动中（防重复点击）
const moveError = ref('')

async function confirmMove() {
  const target = moveTarget.value
  if (!target?.id || moving.value) return
  moving.value = true
  moveError.value = ''
  try {
    await moveToNet(target.id)
    moveDlgVisible.value = false
    // 移动成功：后端会补齐新位置的 ring1，重新拉视野刷新整张地图
    await refreshView()
    bus.emit(BusEvents.TOAST, { type: 'success', message: `已到达 ${target.name}` })
  } catch (err) {
    moveError.value = err.message || '移动失败'
  } finally {
    moving.value = false
  }
}

function cancelMove() {
  moveDlgVisible.value = false
  moveTarget.value = null
  moveError.value = ''
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

// —— 场景列表：跟随选中节点变化重新拉取 ——
const scenes = ref([])
const scenesLoading = ref(false)
const scenesError = ref('')

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

async function loadScenes(node) {
  if (!node?.id) {
    scenes.value = []
    return
  }
  scenesLoading.value = true
  scenesError.value = ''
  try {
    scenes.value = await getMapScenes(node.id)
  } catch (err) {
    scenes.value = []
    scenesError.value = err.message || '场景加载失败'
  } finally {
    scenesLoading.value = false
  }
}

// 选中节点变化时自动拉场景（含 onMounted 后 selected 初始化触发）
watch(selected, (node) => loadScenes(node))

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
            <div class="scene-list">
                <div class="scene-list-title">场景</div>
                <div v-if="scenesLoading" class="scene-empty">加载中...</div>
                <div v-else-if="scenesError" class="scene-empty">{{ scenesError }}</div>
                <template v-else-if="scenes.length">
                    <div
                        v-for="sc in scenes"
                        :key="sc.id"
                        class="scene-item"
                    >
                        <img src="/icon/icon-exit.gif">
                        <span class="scene-name">{{ sc.name }}</span>
                        <span v-if="sc.scene_type" class="scene-type">{{ sceneTypeLabel(sc.scene_type) }}</span>
                    </div>
                </template>
                <div v-else class="scene-empty">此地无可入场景</div>
            </div>
        </div>

        <!-- 移动确认弹窗（点击对角邻居时弹出） -->
        <Dlg v-if="moveDlgVisible" @close="cancelMove">
            <div class="move-dlg">
                <p class="move-dlg-text">是否前往 <span class="move-target-name">{{ moveTarget?.name }}</span>？</p>
                <p v-if="moveTarget?.danger_level" class="move-dlg-tip">
                    ⚠ 危险等级 {{ moveTarget.danger_level }}
                </p>
                <p v-if="moveError" class="move-dlg-error">{{ moveError }}</p>
                <div class="move-dlg-actions">
                    <button class="move-btn move-btn--ok"
                        :disabled="moving"
                        @click="confirmMove">{{ moving ? '移动中...' : '前往' }}</button>
                    <button class="move-btn move-btn--cancel"
                        :disabled="moving"
                        @click="cancelMove">取消</button>
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
                color: var(--link);
                cursor: pointer;
                text-decoration: underline;
            }
        }
    }
    .location-description{
        margin-bottom: 10px;
    }
    .scene-list{
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
            color: var(--link);
        }
        .scene-empty{
            color: var(--text-faint);
            font-style: italic;
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
        color: var(--accent);
        font-weight: bold;
    }
}
.move-dlg-tip{
    font-size: var(--fs-sm);
    color: var(--danger);
}
.move-dlg-error{
    font-size: var(--fs-sm);
    color: var(--error);
}
.move-dlg-actions{
    display: flex;
    gap: 12px;
    margin-top: 4px;
}
.move-btn{
    padding: 5px 18px;
    font-size: var(--fs-md);
    cursor: pointer;
    border: 1px solid var(--border-mid);
    background: var(--panel-bg);
    color: var(--text);
    border-radius: 2px;
    transition: background 0.15s;
}
.move-btn:hover:not(:disabled){
    background: var(--panel-bg-soft);
}
.move-btn:disabled{
    opacity: 0.5;
    cursor: not-allowed;
}
.move-btn--ok{
    background: var(--accent);
    color: var(--text-light);
    border-color: var(--accent-hover);
}
.move-btn--ok:hover:not(:disabled){
    background: var(--accent-hover);
}
</style>
