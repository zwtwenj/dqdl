# 故事事件数据结构（game-adaptation）

把 dqdl_writer 生成的网状故事（`narrative` / `choice` / `ending`）适配成游戏内**可玩事件**的数据结构设计。

---

## 1. 设计原则

1. **一个事件 = 一条记录**：整个网状故事入库为一条 `story_event` 记录，**不做连接表拆分**。
2. **节点 + 连线都在 story JSON 里**：`nodes` 字段保留完整节点图，`next` / `choices.goto` 连线原样在 JSON 中。
3. **节点间的游戏动作 = `action` 字段**：挂在节点或分支上，是节点数据的一部分，不是独立表。
4. **运行时推进**：server 读当前节点的 `action` → 封装**原子化事件** → SSE 推前端 → 前端执行动作（开战斗/发任务/领奖励）→ 完成后 advance 到下一节点。

---

## 2. 表结构

### 2.1 `story_event`（事件定义）

```sql
CREATE TABLE story_event (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  story_id      VARCHAR(64) NOT NULL UNIQUE,        -- story_xxx
  title         VARCHAR(64) NOT NULL,
  theme         VARCHAR(32) DEFAULT NULL,
  nodes         JSON NOT NULL,                      -- 完整节点图（含连线+action）
  endings_count INT NOT NULL DEFAULT 0,
  max_depth     INT NOT NULL DEFAULT 0,
  source        VARCHAR(16) DEFAULT 'agent',
  status        VARCHAR(16) DEFAULT 'active',       -- active/disabled
  created_at    DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6)
);
```

### 2.2 `story_event_instance`（运行实例）

```sql
CREATE TABLE story_event_instance (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  event_id     INT NOT NULL,                        -- 关联 story_event.id
  player_id    INT NOT NULL,
  current_node VARCHAR(32) DEFAULT NULL,            -- 演出进度
  node_path    JSON DEFAULT NULL,                   -- 走过的节点
  status       VARCHAR(16) DEFAULT 'pending',       -- pending/playing/done/abandoned
  from_status  INT DEFAULT NULL,                    -- 触发前玩家状态（恢复用）
  created_at   DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6),
  updated_at   DATETIME(6) ON UPDATE CURRENT_TIMESTAMP(6)
);
```

---

## 3. nodes JSON schema

连线保留在 JSON 中，与 dqdl-agent `story` 表的 `{start, nodes:{nodeId:{...}}}` 同思路：

```jsonc
{
  "start": "n1",
  "nodes": {
    "n1": {
      "type": "narrative",
      "title": "血迹追踪",
      "text": "你正擦拭着刀上的兽血……",
      "next": "n2",              // narrative：连线 = next
      "action": null             // 无动作，直接推进
    },
    "n2": {
      "type": "choice",
      "title": "规则压制",
      "text": "通道尽头……",
      "choices": [
        {
          "text": "先退出去打听消息",
          "intent": "探索", "risk": "low",
          "goto": "n3",          // choice：连线 = goto
          "action": {            // 分支动作
            "kind": "move",
            "target_map": "魔兽山脉外围",
            "task_name": "前往魔兽山脉外围",
            "task_desc": "你决定先退出遗迹休整并打听消息。",
            "giver_text": "坊市守门的佣兵告诉你……"   // 仅文案，不建 NPC
          }
        },
        {
          "text": "硬闯机关",
          "intent": "激进", "risk": "high",
          "goto": "n4",
          "action": {
            "kind": "battle",
            "mob_id": "WB-027",
            "mob_name": "炎尾蜥",
            "mob_hint": "一阶魔兽"
          }
        }
      ]
    },
    "n3": { "type": "narrative", "title": "暗流寻踪", "text": "……", "next": "n5", "action": null },
    "n4": { "type": "ending", "title": "暗门逃生", "text": "……", "end": true }
  }
}
```

### 节点字段

| 字段 | 说明 |
|---|---|
| `type` | `narrative` / `choice` / `ending` |
| `title` | 节点标题 |
| `text` | 叙事正文（前端 v-html 展示） |
| `next` | narrative 类型：下一节点 id（连线） |
| `choices` | choice 类型：`[{ text, intent, risk, goto, action }]` |
| `end` | ending 类型：`true` |
| `action` | 本节点/分支的游戏动作（可选，见下） |

---

## 4. action 枚举

| kind | 语义 | 载荷字段 | 前端行为 |
|---|---|---|---|
| `null` | 直接推进 | — | 调 advance 直接到下一节点 |
| `battle` | 战斗事件 | `mob_id, mob_name, mob_hint` | `BATTLE_OPEN { mobId }` → 胜利后 advance |
| `move` | 移动任务 | `target_map, target_net_id?, task_name, task_desc, giver_text?` | server 发"前往地图"任务 → 到达后 advance |
| `reward` | 奖励事件 | `money?, items?` | 直接发奖励 → advance |
| `dialog` | 对话演出（预留） | `lines?` | 纯对话展示 → advance |

**battle 示例**：`{ "kind": "battle", "mob_id": "WB-027", "mob_name": "炎尾蜥", "mob_hint": "一阶魔兽" }`

**move 示例**：
```jsonc
{
  "kind": "move",
  "target_map": "魔兽山脉外围",
  "target_net_id": null,           // 可后续由 server 解析为 location_net.id
  "task_name": "前往魔兽山脉外围",
  "task_desc": "你决定先退出遗迹休整并打听消息。",
  "giver_text": "坊市守门的佣兵告诉你，最近魔兽山脉外围常有异动。"
}
```
> move 任务**不做 NPC 匹配**：`giver_text` 仅作为发布任务时的文案展示，不建 NPC 记录、不入 npc 表。任务发布走 server 的剧情任务接口（`type='story'`），target 为 `{ type:'move', net_name }`。

**reward 示例**：`{ "kind": "reward", "money": 3000, "items": [ { "item_id": "cl-100", "name": "焰鳞片", "count": 2 } ] }`

---

## 5. 运行时推进协议

### SSE 事件（统一事件名 `story_event`）

server 读 `story_event.nodes` 当前节点 → 若 `action.kind` 非空 → 封装原子化事件推送：

```jsonc
{
  "instance_id": 5,
  "story_id": "story_xxx",
  "current_node": "n2",
  "to_node": "n4",
  "action": { "kind": "battle", "mob_id": "WB-027", "mob_name": "炎尾蜥", "mob_hint": "一阶魔兽" }
}
```

无 action 时 `action: null`，前端直接调 advance。

### advance 接口（POST /api/story/instance/:id/advance）

```
请求体: { action_result?: { kind: 'battle'|'move'|'reward'|null, success: boolean, ... } }
响应:   { current_node: 下一节点 id, node: 下一节点数据, action: 下一节点的 action 或 null }
```

- battle 胜利 → `{ kind:'battle', success:true }` → 推进到 `to_node`
- battle 失败/逃跑 → 不推进（停留在本节点，可重试）
- move 到达 → `{ kind:'move', success:true }` → 推进
- reward 发放完成 → `{ kind:'reward', success:true }` → 推进
- 无 action → 直接推进

### 统一函数库入口（预留签名，本期不实现）

**server** `src/story/story-event.handlers.ts`：

```ts
// 原子化事件处理器注册表：按 action.kind 分发
const handlers: Record<string, StoryEventHandler> = {
  battle: async (ctx: EventContext) => { /* 开战斗 BATTLE_OPEN */ },
  move:   async (ctx: EventContext) => { /* 发布移动任务 */ },
  reward: async (ctx: EventContext) => { /* 发放奖励 */ },
  dialog: async (ctx: EventContext) => { /* 对话演出（预留） */ },
};
interface EventContext {
  instance: StoryEventInstance;
  node: any;            // 当前节点
  action: any;          // 当前节点的 action
  sse: ScriptSseService;
  player: any;
}
```

**web** `utils/sseEventHandlers.js` 追加：

```js
story_event: (data) => {
  switch (data?.action?.kind) {
    case 'battle': bus.emit(BusEvents.BATTLE_OPEN, { mobId: data.action.mob_id }); break;
    case 'move':   /* 调任务发布 → 引导移动 */ break;
    case 'reward': /* 领奖励 */ break;
    default:       advanceStoryEvent(data.instance_id, data.current_node)
  }
}
```

---

## 6. 适配阶段生成规则（dqdl_writer，后续实现）

v5 生成 story 后，适配阶段把节点图转成上述 nodes JSON，并逐连接决策 action：

1. **结构转换**：`nodes[]` 数组 → `{ start, nodes: {id: {...}} }` 映射；`next`/`choices.next` → `next`/`choices.goto`；`narrative` → `text`。
2. **action 决策**（LLM 审查每个连接）：
   - 该连接是否需要一个游戏动作（battle / move / reward / none）
   - 需要时只输出**语义描述**（如"斗者一星的火系魔兽"、"魔兽山脉外围的地图"），**不编造 ID**
3. **向量库检索回填真实 ID**：
   - `battle` → `rag_service.search(query, sources=['魔兽图鉴.docx'])` 取真实 `mob_id`（WB-xxx）/ 名称 / 品阶
   - `move` → `rag_service.search(query, sources=['基础场景设定.docx'])` 取地图名 / 描述
   - `reward` → `rag_service.search(query, sources=['材料图鉴.docx','魔核图鉴.docx'])` 取掉落
4. **入库**：写入 `story_event`（一条记录）；玩家触发时写 `story_event_instance`。

> 真实 ID 由向量库检索兜底，杜绝 LLM 编造不存在的 mob_id（如 WB-999）。

---

## 7. 与现有系统关系

| 现有表 | 关系 |
|---|---|
| `script_outline` / `script_instance` | 剧本演出体系（分镜/演员/SSE 对话流）。story_event 是纯"节点+动作"事件流，两者互补，可并行 |
| `task` | move 动作的落地：发布 `type='story'` 任务，target 为 `{type:'move', net_name}`，giver 仅文案 |
| `mob` | battle 动作的落地：`mob_id` 与 mob 表对齐（WB-xxx），战斗走现有 `POST /battle/start` |
| `battle_log` | 战斗持久化，story 战斗复用现有机制 |

---

## 8. 验证

- migration SQL 语法正确、entity 与 DDL 字段对齐
- 用现有 v5 故事（`story_20260807_112825`）套 nodes JSON schema，确认能完整表达：连线（next/goto）在 JSON 中、action 挂节点/分支、ending 标 `end: true`
- action 示例的 mob_id 能在魔兽图鉴（向量库）找到真实条目
