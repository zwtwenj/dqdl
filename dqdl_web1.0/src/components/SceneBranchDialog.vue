<script setup>
/**
 * RPG 式分支对话弹窗（全局原子组件）。
 *
 * 与 NpcDialog 的区别：
 *   - NpcDialog 是「聊天式」：玩家有输入框，AI 自由生成回复，显示历史
 *   - 本组件是「RPG 分支树式」：纯预设剧本，玩家无输入只有选项，只显示当前节点台词
 *
 * 剧本结构（对齐 refine_script storyboard，便于后续接真剧本）：
 *   { start, nodes: { nodeId: { text, choices:[{text,goto}], end } } }
 *   - start：入口节点 id
 *   - node.text：NPC 当前这句台词
 *   - node.choices：玩家可选选项，goto 跳到下一节点
 *   - node.end：true 表示结局节点，无 choices，显示「结束对话」按钮
 *
 * 触发：进入坊市(market)且场景内有动态演员 → GameView.onEnterScene emit SCENE_BRANCH_OPEN。
 * 当前剧本为前端假数据，后续替换为「匹配分镜内容」的真实剧本。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'

const open = ref(false)
const npc = ref(null)          // 触发对话的演员 { name, role_name, ... }
const scene = ref(null)        // 场景对象 { name, scene_type, ... }
const script = ref(null)       // 当前剧本 { start, nodes }
const currentNodeId = ref(null)

/** 节点 id 合法性兜底（goto 指向不存在的节点时回退到 start，避免白屏） */
const resolvedNodeId = computed(() => {
  const id = currentNodeId.value
  if (id != null && script.value?.nodes?.[id]) return id
  return script.value?.start ?? null
})

/** 当前节点对象 */
const currentNode = computed(() => {
  if (!script.value || resolvedNodeId.value == null) return null
  return script.value.nodes?.[resolvedNodeId.value] || null
})

/** 是否结局节点 */
const isEnd = computed(() => !!currentNode.value?.end)

// ============================================================
//  假数据剧本（后续替换为「匹配分镜内容」的真实剧本）
//  按 scene.scene_type 选择对应剧本；未匹配则不弹。
//  结构对齐 refine_script storyboard 的 {start, map}（这里用 nodes 命名，语义同 map）
// ============================================================
const SCRIPTS = {
  // 坊市：动态演员兜售「地阶斗技消息」（用户给出的示例剧情）
  market: {
    start: 'intro',
    nodes: {
      intro: {
        text: '朋友，我这里有一条关于地阶斗技的消息，有没有兴趣？',
        choices: [
          { text: '愿闻其详', goto: 'detail' },
          { text: '不屑一顾', goto: 'refuse' },
        ],
      },
      detail: {
        text: '传闻最近有人在魔兽山脉深处获得了一张藏宝图，可能是一位斗宗强者的传承。',
        choices: [
          { text: '详细说说', goto: 'price' },
          { text: '一派胡言', goto: 'refuse' },
        ],
      },
      price: {
        text: '藏宝图我只要五百金币就转让给你，如何？这可是千载难逢的机缘。',
        choices: [
          { text: '成交（后续接交易）', goto: 'accept' },
          { text: '太贵了，算了', goto: 'refuse' },
        ],
      },
      accept: {
        text: '痛快！图就在这儿，祝你好运。咱们后会有期。',
        end: true,
      },
      refuse: {
        text: '随你便，错过可别后悔。这种机缘，可不会等人。',
        end: true,
      },
    },
  },
  // 预留：其他场景类型的剧本后续补充
}

/** 打开：{ npc, scene } → 按场景类型选剧本 → 跳到 start 节点 */
function handleOpen({ npc: n, scene: s }) {
  const sceneType = s?.scene_type
  const sc = SCRIPTS[sceneType]
  if (!sc) return // 该场景类型暂无剧本，不弹
  npc.value = n
  scene.value = s
  script.value = sc
  currentNodeId.value = sc.start
  open.value = true
}

/** 选择某选项 → 跳转到目标节点 */
function pickChoice(choice) {
  currentNodeId.value = choice.goto
}

/** 关闭 */
function close() {
  open.value = false
  // 清理状态，避免下次打开闪现旧内容
  script.value = null
  currentNodeId.value = null
  npc.value = null
  scene.value = null
}

let offOpen = null
onMounted(() => {
  offOpen = bus.on(BusEvents.SCENE_BRANCH_OPEN, handleOpen)
})
onUnmounted(() => {
  offOpen && offOpen()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="branch-overlay"
    >
      <div class="branch-box">
        <!-- header：演员名 + 职能 + 场景 + 关闭 -->
        <div class="branch-header">
          <span class="branch-npc-name">{{ npc?.name || '???' }}</span>
          <span class="branch-npc-info">
            {{ npc?.role_name || '神秘人' }}
            <span class="branch-scene-tag">· {{ scene?.name || '' }}</span>
          </span>
          <button
            class="branch-close"
            type="button"
            @click="close"
          >
            ×
          </button>
        </div>

        <!-- 台词区：只显示当前节点台词（不显示历史） -->
        <div class="branch-stage">
          <div class="branch-portrait">🗡️</div>
          <div class="branch-text">
            {{ currentNode?.text || '……' }}
          </div>
        </div>

        <!-- 选项区：当前节点的 choices；结局节点显示「结束对话」 -->
        <div class="branch-choices">
          <template v-if="isEnd">
            <button
              class="branch-choice branch-choice-end"
              type="button"
              @click="close"
            >
              结束对话
            </button>
          </template>
          <template v-else>
            <button
              v-for="(choice, idx) in currentNode?.choices || []"
              :key="idx"
              class="branch-choice"
              type="button"
              @click="pickChoice(choice)"
            >
              {{ choice.text }}
            </button>
          </template>
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
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 32px 28px;
  min-height: 180px;
}
.branch-portrait {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.6rem;
  border: 1px solid rgba(150, 120, 70, 0.35);
  border-radius: 50%;
  background: rgba(30, 24, 16, 0.6);
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6));
}
.branch-text {
  flex: 1;
  font-size: 17px;
  line-height: 1.9;
  color: #e8e2d0;
  letter-spacing: 1px;
  text-indent: 2em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
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
