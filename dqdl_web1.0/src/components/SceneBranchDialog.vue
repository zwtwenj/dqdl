<script setup>
/**
 * 剧本演出弹窗（全局原子组件，真实数据驱动）。
 *
 * 触发：SSE script_trigger → sseHandler 调 getScriptNode → emit SCRIPT_NODE_READY
 *   → 本组件接收 { node } 渲染。
 *
 * 节点数据结构（后端 GET /api/script/instance/:id/node 返回）：
 *   {
 *     instance_id, story_id, title, node_id,
 *     lines: [{ role, text }],            // role ∈ narration / player / {actor_key}
 *     choices: [{ text, goto }] | null,    // null 或空 = 结局节点
 *     end: bool,
 *     location: { type, id } | null,
 *     actors: [{ key, type, info }]        // 本节点出场演员，info 含 name/gender/role_name
 *   }
 *
 * 渲染规则：
 *   - lines 每行按 role 显示发言者（用 actors 映射成可读名）
 *     · narration → 旁白（无前缀名，斜体灰）
 *     · player → 「你」
 *     · 配角 key → actors 里查 info.name，查不到显示 role_name 或「??」
 *   - choices 渲染按钮（本轮点击暂 toast，推进接口下轮做）
 *   - end 节点显示「结束对话」（本轮也暂 toast，恢复状态接口下轮做）
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { advanceScript } from '../api/script'

const open = ref(false)
const node = ref(null)            // 当前节点完整数据
const actorMap = ref({})          // 本节点 actors 按 key 索引：{key: {type, info}}
const advancing = ref(false)      // 推进中（禁用选项防连点）
const lineIndex = ref(0)          // 当前显示到 lines 的第几行（逐行推进）

/** 当前应显示的那一行台词 */
const currentLine = computed(() => {
  const lines = node.value?.lines || []
  return lines[lineIndex.value] || null
})

/** 当前行的角色解析（决定渲染样式 + 发言者标签） */
const currentRole = computed(() => {
  if (!currentLine.value) return { kind: 'narration', label: '' }
  return resolveRole(currentLine.value.role)
})

/** 所有台词是否已显示完（true 时再点击就显示选项） */
const allLinesShown = computed(() => {
  const lines = node.value?.lines || []
  return lineIndex.value >= lines.length - 1
})

/** 是否该显示选项区（台词看完 + 非结局节点） */
const showChoices = computed(() => allLinesShown.value && !isEnd.value)

/** 当前节点是否结局节点 */
const isEnd = computed(() => !!(node.value?.end) || !(node.value?.choices?.length))

/** 把 line.role 映射成可读的发言者标签 + 类型（决定渲染样式）。
 *  返回 { kind: 'narration'|'player'|'actor', label } */
function resolveRole(role) {
  if (role === 'narration') return { kind: 'narration', label: '' }
  if (role === 'player') return { kind: 'player', label: '你' }
  // 配角：从 actorMap 查
  const a = actorMap.value[role]
  const name = a?.info?.name || a?.info?.role_name || '??'
  return { kind: 'actor', label: name }
}

/** 把后端返回的节点数据应用到渲染状态 */
function applyNode(n) {
  if (!n) return
  node.value = n
  lineIndex.value = 0  // 新节点从第一行开始
  const map = {}
  for (const a of n.actors || []) {
    map[a.key] = a
  }
  actorMap.value = map
}

/**
 * 点击弹窗（台词区/遮罩）推进到下一行；
 * 已是最后一行时不再推进（此时显示选项区，由选项按钮触发后端推进）。
 * 结局节点看完最后一行显示「结束对话」按钮。
 */
function nextLine() {
  if (!allLinesShown.value) {
    lineIndex.value += 1
  }
}

/** 打开：接收 { node } 渲染 */
function handleNodeReady({ node: n }) {
  if (!n) return
  applyNode(n)
  open.value = true
}

/** 选择某选项 → 调推进接口 → 更新渲染 */
async function pickChoice(choice) {
  if (advancing.value) return
  const instanceId = node.value?.instance_id
  if (!instanceId || !choice?.goto) return
  advancing.value = true
  try {
    const next = await advanceScript(instanceId, choice.goto)
    applyNode(next)
  } catch (err) {
    bus.emit(BusEvents.TOAST, {
      type: 'error',
      message: err.message || '推进剧本失败',
    })
  } finally {
    advancing.value = false
  }
}

/** 结束对话（结局节点；本轮暂 toast，恢复状态接口下轮做） */
function close() {
  if (isEnd.value) {
    bus.emit(BusEvents.TOAST, {
      type: 'info',
      message: '【预览】剧本结束（状态恢复待实现）',
    })
  }
  open.value = false
  node.value = null
  actorMap.value = {}
  advancing.value = false
  lineIndex.value = 0
}

let offReady = null
onMounted(() => {
  offReady = bus.on(BusEvents.SCRIPT_NODE_READY, handleNodeReady)
})
onUnmounted(() => {
  offReady && offReady()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="branch-overlay"
    >
      <div class="branch-box">
        <!-- header：剧本标题 + 节点 id + 关闭 -->
        <div class="branch-header">
          <span class="branch-npc-name">🎬 {{ node?.title || '剧本演出' }}</span>
          <span class="branch-npc-info">
            节点 {{ node?.node_id || '?' }}
          </span>
          <button
            class="branch-close"
            type="button"
            @click="close"
          >
            ×
          </button>
        </div>

        <!-- 台词区：逐行显示（点击推进下一行），全部看完才显示选项 -->
        <div
          class="branch-stage"
          @click="nextLine"
        >
          <div
            v-if="currentLine"
            :class="['branch-line', 'branch-line-' + currentRole.kind]"
          >
            <span
              v-if="currentRole.kind !== 'narration'"
              class="branch-line-speaker"
            >{{ currentRole.label }}：</span>
            <span class="branch-line-text">{{ currentLine.text }}</span>
          </div>
          <!-- 提示：点击继续（未看完时） -->
          <div
            v-if="!allLinesShown"
            class="branch-stage-hint"
          >点击继续 ▾</div>
        </div>

        <!-- 选项区：台词全部看完后才显示 -->
        <div
          v-if="showChoices"
          class="branch-choices"
        >
          <button
            v-for="(choice, idx) in node?.choices || []"
            :key="idx"
            class="branch-choice"
            type="button"
            :disabled="advancing"
            @click.stop="pickChoice(choice)"
          >
            {{ choice.text }}
          </button>
        </div>
        <!-- 结局节点：看完台词显示「结束对话」 -->
        <div
          v-else-if="allLinesShown && isEnd"
          class="branch-choices"
        >
          <button
            class="branch-choice branch-choice-end"
            type="button"
            @click.stop="close"
          >
            结束对话
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 全屏遮罩：与 NpcDialog/BattlePanel 对齐（1200px 设计区） */
.branch-overlay {
  position: fixed;
  width: 1200px;
  inset: 0;
  z-index: 250;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 12, 0.75);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}

.branch-box {
  width: 720px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.96), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.45);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* header */
.branch-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(150, 120, 70, 0.25);
  background: rgba(40, 30, 18, 0.5);
}
.branch-npc-name {
  font-size: 18px;
  color: #e8d5a0;
  letter-spacing: 2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
.branch-npc-info {
  flex: 1;
  font-size: 12px;
  color: rgba(200, 170, 110, 0.7);
  letter-spacing: 1px;
}
.branch-scene-tag {
  color: rgba(180, 160, 130, 0.5);
}
.branch-close {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(150, 120, 70, 0.4);
  background: transparent;
  color: rgba(220, 200, 160, 0.7);
  border-radius: 6px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}
.branch-close:hover {
  background: rgba(150, 120, 70, 0.2);
  color: #e8d5a0;
}

/* 台词区 */
.branch-stage {
  padding: 24px 28px;
  min-height: 180px;
  max-height: 50vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  cursor: pointer;
  position: relative;
}
.branch-stage-hint {
  position: absolute;
  right: 20px;
  bottom: 12px;
  font-size: 12px;
  color: rgba(180, 160, 130, 0.5);
  letter-spacing: 1px;
  animation: branch-blink 1.5s ease-in-out infinite;
}
@keyframes branch-blink {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.9; }
}

/* 台词行（每行一句，按发言者类型区分样式） */
.branch-line {
  font-size: 16px;
  line-height: 1.8;
  letter-spacing: 1px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
/* 旁白：斜体灰色，无发言者前缀，缩进 */
.branch-line-narration {
  color: rgba(200, 180, 150, 0.75);
  font-style: italic;
  text-indent: 2em;
}
/* 玩家：浅金色 */
.branch-line-player .branch-line-speaker {
  color: #ffd97a;
  font-weight: bold;
  margin-right: 2px;
}
.branch-line-player .branch-line-text {
  color: #e8d5a0;
}
/* 配角：青色 */
.branch-line-actor .branch-line-speaker {
  color: #7fd4c4;
  font-weight: bold;
  margin-right: 2px;
}
.branch-line-actor .branch-line-text {
  color: #c8e8e0;
}

/* 选项区 */
.branch-choices {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 28px 24px;
  border-top: 1px solid rgba(150, 120, 70, 0.25);
}
.branch-choice {
  padding: 12px 20px;
  border: 1px solid rgba(150, 120, 70, 0.4);
  background: rgba(30, 24, 16, 0.5);
  color: #e8d5a0;
  border-radius: 6px;
  font-size: 15px;
  letter-spacing: 1.5px;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.18s ease;
  position: relative;
  padding-left: 36px;
}
.branch-choice::before {
  content: '▸';
  position: absolute;
  left: 16px;
  color: rgba(180, 150, 90, 0.6);
  transition: all 0.18s ease;
}
.branch-choice:hover {
  background: rgba(150, 120, 70, 0.22);
  border-color: rgba(200, 170, 110, 0.7);
  color: #fff5dc;
  transform: translateX(2px);
}
.branch-choice:hover::before {
  color: #e8d5a0;
}
.branch-choice-end {
  text-align: center;
  padding-left: 20px;
  color: rgba(180, 160, 130, 0.7);
  border-style: dashed;
}
.branch-choice-end::before {
  content: '';
}
.branch-choice-end:hover {
  color: #e8d5a0;
}
</style>
