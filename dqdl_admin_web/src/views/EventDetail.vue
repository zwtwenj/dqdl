<script setup>
/**
 * 事件详情页：用 AntV X6 渲染事件节点图（节点 + 边都可点击）。
 *
 * 数据：GET /api/events/:id → event.nodes = { start, nodes: { id: { type, title, text, next/choices, action } } }
 * 布局：BFS 分层（narrative 走 next，choice 走 choices.goto），与 dqdl_writer 可视化一致。
 * 交互：
 *   - 点击节点 → 右侧显示该节点详情（文本/choices/action）
 *   - 点击边 → 显示连线信息（来源 → 目标）
 */
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Graph } from '@antv/x6'
import { getEvent, saveConnectConfig, saveTriggerConfig } from '../api/eventManage'
import EventTriggers from '../components/EventTriggers.vue'
import TaskConfig from '../components/TaskConfig.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const event = ref(null)
const selected = ref(null)       // 选中节点或边详情
const selectedType = ref('')     // 'node' | 'edge'

let graph = null

const TYPE_COLOR = {
  narrative: { bg: '#1f3a5f', border: '#4da6ff', label: '叙事' },
  choice: { bg: '#5f1f1f', border: '#e94560', label: '选择' },
  ending: { bg: '#1f5f2a', border: '#53d76b', label: '结局' },
}

/** BFS 分层布局：narrative 走 next，choice 走 choices.goto */
function layoutNodes(nodeMap, start) {
  const adj = {}
  Object.keys(nodeMap).forEach((id) => {
    const n = nodeMap[id]
    adj[id] = []
    if (n.next && nodeMap[n.next]) adj[id].push(n.next)
    ;(n.choices || []).forEach((c) => {
      if (c.goto && nodeMap[c.goto]) adj[id].push(c.goto)
    })
  })
  // BFS 层级
  const lv = {}
  const queue = [{ id: start, l: 0 }]
  const visited = new Set()
  while (queue.length) {
    const { id, l } = queue.shift()
    if (visited.has(id)) continue
    visited.add(id)
    lv[id] = l
    ;(adj[id] || []).forEach((t) => {
      if (!visited.has(t)) queue.push({ id: t, l: l + 1 })
    })
  }
  let maxL = Math.max(0, ...Object.values(lv))
  Object.keys(nodeMap).forEach((id) => {
    if (!(id in lv)) lv[id] = ++maxL
  })
  // 同层按 id 排序，计算坐标
  const layers = {}
  Object.keys(lv).forEach((id) => {
    ;(layers[lv[id]] = layers[lv[id]] || []).push(id)
  })
  const NW = 200, NH = 90, GX = 40, GY = 30
  const pos = {}
  Object.keys(layers)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((l) => {
      layers[l].forEach((id, i) => {
        pos[id] = { x: l * (NW + GX) + 20, y: i * (NH + GY) + 20 }
      })
    })
  return pos
}

/** 构建 X6 图数据（用原生 rect 节点，避免 html 注入不可靠） */
function buildGraphData(nodeMap, start) {
  const pos = layoutNodes(nodeMap, start)
  const nodes = Object.keys(nodeMap).map((id) => {
    const n = nodeMap[id]
    const t = TYPE_COLOR[n.type] || TYPE_COLOR.narrative
    const icon = { battle: '⚔', move: '🚶', reward: '🎁' }[n.action?.kind] || ''
    return {
      id,
      shape: 'rect',
      width: 180,
      height: 52,
      x: pos[id].x,
      y: pos[id].y,
      data: n,
      attrs: {
        body: {
          fill: '#ffffff',
          stroke: t.border,
          strokeWidth: 2,
          rx: 8,
          ry: 8,
          filter: 'none',
        },
        label: {
          text: `${t.label}·${(n.title || id).slice(0, 10)}${icon ? ' ' + icon : ''}`,
          fill: '#333333',
          fontSize: 12,
          fontWeight: 'bold',
          textWrap: { width: 160 },
        },
      },
    }
  })
  const edges = []
  Object.keys(nodeMap).forEach((id) => {
    const n = nodeMap[id]
    if (n.next && nodeMap[n.next]) {
      edges.push({ source: id, target: n.next, attrs: { line: { stroke: '#4da6ff', strokeWidth: 1.5 } }, data: { kind: 'narrative' } })
    }
    ;(n.choices || []).forEach((c) => {
      if (c.goto && nodeMap[c.goto]) {
        edges.push({
          source: id, target: c.goto,
          attrs: { line: { stroke: '#e94560', strokeWidth: 1.5, strokeDasharray: '6,3' } },
          data: { kind: 'choice', text: c.text },
        })
      }
    })
  })
  return { nodes, edges }
}

/** 创建 X6 图 */
function createGraph(container, nodeMap, start) {
  graph = new Graph({
    container,
    width: 1400,
    height: 700,
    background: { color: '#f5f7fa' },
    grid: { visible: true, size: 16, args: { color: '#e4e7ed' } },
    interacting: { nodeMovable: true, edgeMovable: false },
    // 滚轮缩放（以鼠标为中心）
    mousewheel: {
      enabled: true,
      modifiers: [],
      minScale: 0.2,
      maxScale: 3,
    },
    // 画布平移（按住鼠标拖动画板）。
    // 注意：eventTypes 不要加 'mouseWheel' —— 会与上方滚轮缩放在同一 wheel 事件上同时触发，
    // 造成滚动时又缩放又平移。滚轮只负责缩放，平移只靠拖拽。
    panning: {
      enabled: true,
      eventTypes: ['leftMouseDown', 'rightMouseDown'],
    },
    // 滚轮优先缩放（不拦截页面滚动）。
    // 注意：不要开 autoResize —— 它会用 ResizeObserver 观察容器父级，
    // 并把父级尺寸写回容器 inline style；而父级高度由容器撑开（flex 无固定高），
    // 写回后父级又变高 → 死循环，容器高度无限增长（实测每秒 +20px 且不停）。
    // 容器高度本就固定 700px、svg 为 100%×100% 随宽度自适应，无需 autoResize。
    preventDefaultBlankAction: true,
  })
  // X6 构造时会用 options.width/height 把容器 style 写成 1400px 宽，
  // 挤掉外层 flex 的自适应宽度（旧的"无用 width"就是它）。清掉 width，
  // 让容器宽度由 flex:1 撑开；高度仍由模板 :style 的 700px 控制。
  container.style.width = ''
  const data = buildGraphData(nodeMap, start)
  graph.fromJSON(data)

  // 节点点击 → 显示节点详情
  graph.on('node:click', ({ node }) => {
    selected.value = node.getData()
    selectedType.value = 'node'
  })
  // 边点击 → 显示连线信息，并反显该连线已保存的配置（connect_configs["src->tgt"]）
  graph.on('edge:click', ({ edge }) => {
    const d = edge.getData() || {}
    const src = edge.getSourceCell()?.id
    const tgt = edge.getTargetCell()?.id
    selected.value = { from: src, to: tgt, kind: d.kind, text: d.text }
    selectedType.value = 'edge'
    const key = `${src}->${tgt}`
    const cfg = event.value?.connect_configs?.[key]
    connectInstance.value = {
      edge: key,
      selectedConnectEvent: cfg?.event || null,
      taskData: cfg?.task ? JSON.parse(JSON.stringify(cfg.task)) : null,
    }
  })
  // 空白点击 → 清除选中
  graph.on('blank:click', () => {
    selected.value = null
    selectedType.value = ''
    connectInstance.value = { edge: null, selectedConnectEvent: null, taskData: null }
  })
  graph.zoomToFit({ padding: 30, maxScale: 1.2 })
}

/** 选中节点/边的展示 */
function selectedLabel() {
  if (selectedType.value === 'node' && selected.value) {
    const n = selected.value
    const t = TYPE_COLOR[n.type] || TYPE_COLOR.narrative
    return { title: `${t.label} · ${n.title || n.id}`, body: renderNodeBody(n), type: 'node' }
  }
  if (selectedType.value === 'edge' && selected.value) {
    const e = selected.value
    return {
      title: e.kind === 'choice' ? '选择分支连线' : '叙事连线',
      type: 'connection',
      body: `<div>${e.from || '?'} → ${e.to || '?'}</div>${e.text ? `<div style="margin-top:6px;color:#666">${e.text}</div>` : ''}`,
    }
  }
  return null
}

function renderNodeBody(n) {
  let html = `<div style="color:#666">${(n.text || '').slice(0, 200)}${(n.text || '').length > 200 ? '…' : ''}</div>`
  if (n.choices?.length) {
    html += '<div style="margin-top:8px;font-weight:bold">选择：</div>'
    html += n.choices.map((c) => `<div style="margin:2px 0;color:#c0392b">▸ ${c.text} → ${c.goto}</div>`).join('')
  }
  return html
}

async function load() {
  loading.value = true
  try {
    const res = await getEvent(route.params.id)
    if (res?.ok) {
      event.value = res.event
      await nextTick()
      const g = res.event.nodes
      if (g?.nodes && g?.start) {
        const container = document.getElementById('x6-container')
        if (container) createGraph(container, g.nodes, g.start)
      }
    } else {
      ElMessage.error(res?.msg || '加载失败')
    }
  } catch {
    ElMessage.error('加载事件失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
onBeforeUnmount(() => {
  if (graph) graph.dispose()
})

// 事件触发配置（独立组件 EventTriggers）：保存回调 → 落库 trigger_config
async function onTriggerSave(config) {
  try {
    const res = await saveTriggerConfig(route.params.id, config)
    if (res?.ok) {
      // 同步本地缓存，保证组件反显
      event.value.trigger_config = config
      ElMessage.success(`已保存触发配置：${config.trigger}（概率 ${config.probability}%）`)
    } else {
      ElMessage.error(res?.msg || '保存触发配置失败')
    }
  } catch {
    ElMessage.error('保存触发配置失败')
  }
}

const connectEventList = [
  { text: '发布任务', value: 'publish_task' },
  // { text: '战斗', value: 'trigger_action' },
]
const connectInstance = ref({
  edge: null,              // 当前连线 key "src->tgt"
  selectedConnectEvent: null,
  taskData: null,          // 发布任务的配置（TaskConfig v-model 双向绑定）
})
const savingConnect = ref(false)

/** 选择连线事件时：首次选"发布任务"初始化默认任务配置（已有值则保留，可回填已保存配置） */
function onConnectEventChange(val) {
  if (val === 'publish_task' && !connectInstance.value.taskData) {
    connectInstance.value.taskData = { taskTitle: '', description: '', target: [], reward: [] }
  }
}

/** 保存前清洗：过滤未配置完整的空目标/空奖励项（type 为空的丢弃，避免脏数据落库） */
function sanitizeTaskConfig(taskData) {
  const t = taskData || {}
  return {
    ...t,
    target: Array.isArray(t.target) ? t.target.filter((x) => x && x.type) : [],
    reward: Array.isArray(t.reward)
      ? t.reward.filter((x) => x && (x.type === 'money' || (x.type === 'item' && x.item_id)))
      : [],
  }
}

/** 保存连线配置：选了事件 → 存 { event, task }；未选 → 删除该连线配置 */
async function saveConnect() {
  const ci = connectInstance.value
  if (!ci.edge || !event.value) return
  savingConnect.value = true
  try {
    const config = ci.selectedConnectEvent
      ? {
          event: ci.selectedConnectEvent,
          task: ci.selectedConnectEvent === 'publish_task'
            ? sanitizeTaskConfig(ci.taskData)
            : undefined,
        }
      : null
    const res = await saveConnectConfig(route.params.id, ci.edge, config)
    if (res?.ok) {
      // 同步本地缓存，保证后续切换连线能反显
      if (!event.value.connect_configs) event.value.connect_configs = {}
      if (config) event.value.connect_configs[ci.edge] = config
      else delete event.value.connect_configs[ci.edge]
      ElMessage.success(`已保存连线 ${ci.edge} 的配置`)
    } else {
      ElMessage.error(res?.msg || '保存失败')
    }
  } catch {
    ElMessage.error('保存失败')
  } finally {
    savingConnect.value = false
  }
}

/** 保存按钮可用性：选了事件，或该连线已有已保存配置（可清空） */
const canSaveConnect = computed(() => {
  const ci = connectInstance.value
  if (!ci.edge) return false
  const hasSaved = !!event.value?.connect_configs?.[ci.edge]
  return !!ci.selectedConnectEvent || hasSaved
})
</script>

<template>
  <div v-loading="loading">
    <div style="margin-bottom: 10px; display: flex; align-items: center; gap: 12px">
      <el-button @click="router.push('/events')">← 返回列表</el-button>
      <span style="font-weight: bold" v-if="event">#{{ event.id }} {{ event.title }}</span>
      <el-tag v-if="event" size="small">{{ event.status }}</el-tag>
      <el-tag v-if="event" size="small" type="info">结局 {{ event.endings_count }}</el-tag>
    </div>

    <!-- 事件触发配置（独立组件，model-value 用于详情进入时回填已保存配置） -->
    <EventTriggers :event-id="route.params.id" :model-value="event?.trigger_config" @save="onTriggerSave" />

    <div style="display: flex; gap: 12px; align-items: flex-start">
      <!-- X6 节点图画布 -->
      <div
        id="x6-container"
        class="x6-wrap"
        :style="{ height: '700px', flex: '1', display: event ? 'block' : 'none' }"
      ></div>


      <!-- 选中节点/边的详情侧栏 -->
      <el-card v-if="selectedLabel()" class="side-card" shadow="never" style="width: 420px">
        <template #header>
          <div style="font-weight: bold">{{ selectedLabel().title }}</div>
        </template>
        <div v-html="selectedLabel().body"></div>
        <div class="action" v-if="selectedLabel().type === 'connection'">
          <div>
            <el-select
              v-model="connectInstance.selectedConnectEvent"
              placeholder="选择连线事件"
              clearable
              @change="onConnectEventChange"
            >
              <el-option v-for="event in connectEventList" :key="event.value" :label="event.text" :value="event.value"></el-option>
            </el-select>
            <TaskConfig v-if="connectInstance.selectedConnectEvent == 'publish_task'" v-model="connectInstance.taskData" />
            <div class="connect-actions">
              <el-button
                type="primary"
                size="small"
                :loading="savingConnect"
                :disabled="!canSaveConnect"
                @click="saveConnect"
              >
                保存连线配置
              </el-button>
            </div>
          </div>
        </div>
        <el-button size="small" style="margin-top: 12px" @click="selected = null; selectedType = ''">关闭</el-button>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.x6-wrap {
  border: 1px solid #dcdfe6;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f7fa;
}

/* ===== 连线配置区（侧栏内） ===== */
.action {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f0f2f5;
}

/* 仅"连线事件"下拉：.action > div > .el-select（避免误伤 TaskConfig 内部的 select） */
.action > div > .el-select {
  width: 100%;
  margin-bottom: 8px;
}

.connect-actions {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed #e4e7ed;
}

.connect-actions .el-button {
  width: 100%;
}
</style>
