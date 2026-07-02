# Agent 动态事件编排

让 agent 在玩家做关键动作（突破/击杀/进地点）时，按"采样 + 冷时间"门控被触发，动态生成场景事件（沿用 `random_event` 节点图格式），写入派发队列，由感知层在条件满足时转为事件实例弹给玩家。

## 架构总览

```
玩家动作(突破/击杀/进地点)
  │  service 里 EventEmitter2.emit('player.xxx', PlayerEvent)
  ▼
AgentOrchestrator (监听器)
  │  ① gate 门控：采样率 + 冷时间(默认30分钟)
  │  ② buildContext：玩家快照 + 任务数 + effect白名单
  │  ③ agent.generateEvent(ctx) → DeepSeek
  │  ④ validate：schema + effect白名单 + 数值钳制
  ▼
EventInstanceService.enqueueDispatch
  │  delivery=immediate    → 立即写 event_instance，玩家下次 getCurrent 时弹
  │  delivery=enter_location → 写 event_dispatch(pending)，等 check() 消费
  ▼
玩家触发(check / getCurrent)
  │
  ▼
前端 RandomEventDialog.vue（沿用节点图，零改动）
```

## 数据模型（3 张表）

| 表 | 作用 |
|---|---|
| `event_template` | 事件模板定义。含手工配的(`source=manual`)与 agent 生成的(`source=agent`)。字段 `trigger_kind` 区分 probabilistic(概率roll)/push(强制塞) |
| `event_instance` | 玩家事件会话状态与对话快照（原 `random_event_log`）。status: started/in_progress/ended |
| `event_dispatch` | **新增**。agent 编排产出的待派发队列。`delivery` 投递策略 + `fire_conditions` 派发条件 + `fire_at` 定时 |

## effect 原子能力注册表

节点图 `node.effects` 里每条 effect 是 `{key: 载荷}` 形式，key 必须在注册表中。注册表位于 `dqdl-server/src/random-event/effect-registry.ts`，各 handler 在 `event-instance.service.ts` 的 `registerEffects()` 中注册。

当前已注册（与 agent prompt 白名单一致）：

| key | 载荷 | 调用 |
|---|---|---|
| `money` | `{money: ±n}` | playerService.grantMoney |
| `giveItem` | `{name, count}` | backpackService.addItem |
| `forgeTask` | `true` | taskService.acceptForgeTask |
| `createTask` | `{name, desc, target[], reward[], star?}` | taskService.create |
| `startBattle` | `{mobId}` | battleService.start |
| `grantCultivation` | `{amount}` | playerService.grantCultivation |
| `triggerEncounter` | `{force?}` | encounterService.generateForced |
| `movePlayer` | `{position:[id]}` | playerService.updatePosition |

**扩展新原子能力**：在 `registerEffects()` 里加一个 `r.register({key, apply})`，并在 `app.py` 的 `EVENT_EFFECT_KEYS` 列表与 prompt 的 effect 语义说明里同步加入。

## 门控配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `ORCH_SAMPLE_BREAKTHROUGH` | 1.0 | 突破触发编排的采样率 |
| `ORCH_SAMPLE_KILL_MOB` | 0.1 | 击杀触发编排的采样率 |
| `ORCH_SAMPLE_ENTER_LOCATION` | 0.05 | 进地点触发编排的采样率 |
| `ORCH_COOLDOWN_MS` | 1800000 (30分钟) | 每玩家 agent 编排冷却时间（按 event_dispatch 最近记录持久化判定） |

## 事件总线

`@nestjs/event-emitter` 接入。已 emit 的领域事件：

| 事件名 | 触发点 | payload |
|---|---|---|
| `player.breakthrough` | player.service.ts breakthrough() | {success, newLevel, oldLevel, levelName} |
| `player.kill_mob` | training.service.ts 历练胜利 | {mobId, mobName} |
| `player.enter_location` | player.service.ts updatePosition() | {locationId, position:[ids]} |

事件载荷类型见 `src/event-bus/events.ts`。新增领域事件只需在动作 service 里 `this.eventEmitter.emit(NAME, playerEvent(...))` 并在 `events.ts` 的 `PLAYER_EVENTS` 加常量。

## RAG 首次接入生成 prompt

`/generate/event` 是项目里第一个把 RAG 检索结果注入 DeepSeek prompt 的端点。`get_context(query, top_k=5, max_chars=2000)` 返回的世界观片段拼进 user prompt 的 `【世界观参考】` 段。RAG 不可用时静默降级为不注入。

## 校验层（偏严格）

`AgentOrchestrator.validate()` 四道关卡：

1. **schema**：必须有 title/nodes；nodes 必须有 start + map，每个节点有 choices/effects/roll/end 之一
2. **effect 白名单**：剔除未注册的 effect key（agent 端 `_normalize_event` 也做一遍，双重保险）
3. **数值钳制**：money 绝对值 ≤ max(1000, level×5000)、item count ≤ 99、修为 ≤ ±100000
4. （预留）**主题相关性**：embedding 相似度，第二迭代开启

校验失败 → 记日志，不入队，等下一个事件再编。绝不影响玩家主流程。

## 数据迁移

首次启动新代码前，执行 `dqdl-server/migrations/rename-event-tables.sql`（先备份）。`event_dispatch` 表由 `synchronize=true` 自动创建。

## 测试

- 契约测试：`pytest dqdl-agent/test_event.py`（18 用例，纯函数，不连网）
- 降级验证：关掉 agent 服务，确认游戏正常跑、手工概率事件照常触发

## 与动态 NPC 的衔接（下个 plan）

本方案是"agent 编排事件"的闭环。后续动态 NPC 的惰性模拟产出"对玩家有影响的事件"时，会复用同一套 enqueueDispatch → fireDueDispatches 管线——即 NPC 的记忆与动机会变成找上门的事件。两套方案在派发队列处汇合。
