# 斗气大陆（DQDL）功能文档 — 重构基线

> 本文档为重构前的现状梳理，覆盖所有模块、数据流、技术债与已知问题。技术栈：NestJS 后端 + Vue3/Pinia 前端 + Python Flask agent(DeepSeek) + MySQL。

---

## 一、整体架构

```
Vue3/Pinia (5173) ──axios/SSE──> NestJS (3000) ──HTTP──> Flask/DeepSeek (5000)
                                       │
                                       └──> MySQL (远程 os.environ.get("DB_HOST", "127.0.0.1"))
```

- **前端**：Vue 3.5 + Pinia 3 + Axios + Vite 8，仅 3 个运行时依赖。SSE 用原生 EventSource。
- **后端**：NestJS 11 + TypeORM 0.3 + MySQL（mysql2）+ EventEmitter2。`synchronize:true` 默认开启（开发态自动建表）。
- **Agent**：Flask + OpenAI SDK（调 DeepSeek）+ sentence-transformers（RAG，numpy 手搓向量库，384 维）。
- **状态权威**：后端为唯一权威，前端做乐观更新 + 失败回滚。玩家 status 经 `assertIdle` 统一校验。

### 玩家活动状态机（PLAYER_STATUS，后端唯一权威）
| 码 | 含义 | 占用模块 |
|---|---|---|
| 1 IDLE | 空闲 | — |
| 2 TRAINING | 历练 | training |
| 3 DUNGEON | 奇遇副本 | dungeon |
| 4 CULTIVATING | 洞天福地修炼 | cultivation |
| 5 ROOM_CULTIVATING | 修炼室修炼 | cultivation-room |
| 6 GATHERING | 采集 | gather |

统一准入校验：`PlayerService.assertIdle(playerId, activity)` — 非 IDLE 抛带具体原因的 BadRequest。

---

## 二、游戏玩法模块（dqdl-server/src/）

### 1. player（玩家核心）
**职责**：属性/等级数学、修炼斗气、突破、功法/宝物/斗技装配、状态机、金币/修为原子操作、移动。

**核心方法**：
- 等级数学（纯函数）：`getLevelK` / `calcLevelCultivation` / `levelAttrBonus` / `levelName` / `breakthroughRate`
- 状态机：`setStatus` / `assertIdle` / `getStatus`
- 修炼突破：`cultivate(id, qiDensity)` / `breakthrough(id)` / `grantCultivation(id, amount)`
- 功法斗技：`cultivateTechnique` / `cultivateSkill` / `breakthroughTechnique`
- 装配：`equipTechnique` / `unequipTechnique` / `equipTreasureFromItem` / `removeTreasureEntry`
- CRUD：`findByIdRaw` / `findOne`（富查询，join 功法/宝物/斗技/buff 定义，组装 final_attrs）/ `patch` / `grantMoney` / `updatePosition`

**属性模型**：`当前属性 = base_*(创建固定) + levelAttrBonus(level) + 装配功法 base + 装配宝物 stats`
**HP/Energy 上限**：`max_hp = (stamina + techBase.stamina)*10 + techBase.hp + 宝物hp`

**已知问题**：
1. `findOne` 富查询单次发起 5+ 子查询，被高频路径（battle.start/training.execute）调用，性能隐患
2. `updatePosition` 状态校验不完整：只拦 status=2/5，3/4/6 下可移动
3. `cultivate` 返回字段名混乱（cultivation 是旧值，newCultivation 是新值）

### 2. battle（战斗引擎）
**职责**：双模式战斗 — 快速战斗（历练用，纯概率分档）+ 回合制战斗（手动，buff/技能/护盾/事件信箱）。

**核心方法**：
- `resolveQuickBattle(playerData, mob)` — 历练用，按总属性比分档胜率掷骰
- `start(playerId, mobId)` — 回合制，createCombatant + 注入战前 buff + 存 sessions Map
- `action(playerId, {type, slot?})` — 回合行动（normal/skill/flee）

**引擎核心**（battle-engine.ts 纯函数）：
- EventBus 信箱模型：buff 间 `post(letter)`/`drain(unit, hook)`，MAX_DEPTH=8
- Hook 体系：onTurnStart/onTurnEnd/beforeAttack/afterAttack/beforeHit/afterHit/passive
- 护盾：barrier buff 吸收伤害
- buffLibrary：dot/damage_mul/dodge/reflect/lifesteal/post_carry/deliver/apply_self

**已知问题**：
1. **会话纯内存**（`sessions: Map`）：服务器重启则所有进行中战斗丢失，无持久化
2. **快速战斗 vs 回合制数值割裂**：快速只比总属性不吃 buff/技能，与回合制结果可能不一致
3. 战前 buff 注入后 `patch({buff:'[]'})` 清空，若玩家同时活动登记了 buff 会被误清
4. seed/equipAll 端点暴露在生产 controller，无鉴权

### 3. training（历练）
**职责**：野外自动遇敌（快速战斗）→ 掉落入背包 → 任务进度推进 → 触发奇遇（10%）→ agent 叙事。SSE 流。

**核心方法**：`begin`（assertIdle + 置TRAINING + 颁令牌）/ `stop` / `execute`（单次历练事件）/ 会话令牌三件套（currentToken/isCurrent/endIfCurrent）

**execute 数据流**：tryGenerate奇遇 → 选mob → resolveQuickBattle → 胜利calcDrops入背包 + checkAndUpdateProgress + 发kill_mob事件 → agent叙事

**配置**：TRAINING_INTERVAL=180s、TRAINING_MAX_DURATION=3h。**依赖最重的模块**（10 个模块依赖）。

**已知问题**：会话令牌仅内存；agent 叙事失败静默降级；SSE 无心跳保活。

### 4. gather（野外采集）
**职责**：野外每 tick 采集一株草药入背包。SSE 流，与 training 同构。**最轻量的 SSE 模块**（不依赖 agent/encounter/battle）。

**掉落概率**：80% 匹配常见草药 / 10% 不匹配常见 / 10% 更高稀有度。配置：GATHER_INTERVAL=10s、GATHER_MAX_DURATION=30min。

**已知问题**：`isCommon` 靠 description 含"常见"判断（脆弱）；无 agent 叙事（硬编码模板）。

### 5. cultivation（洞天福地修炼）
**职责**：由 cultivate 奇遇进入的限时修炼，10 轮结算。SSE 流。

**数据流**：enter消耗奇遇 → settle每tick（effectiveQi = BASE_QI(150) * STAR_MULT{1:1,2:2,3:4} → cultivate）→ 满轮finished。

**已知问题**：**无会话令牌机制**，刷新重连可能误停新会话（靠 abortActive 幂等兜底）。

### 6. cultivation-room（城内修炼室）
**职责**：城内付费修炼，选档位(1-3) + 选内容(qi/technique/skill)，每 tick 扣金币 + 涨修为。SSE 流。

**已知问题（⚠️ 运行时崩溃 bug）**：`enter()` 引用未定义变量 `player`（qi 模式必崩）。无会话令牌。常量与 cultivation 重复。

### 7. dungeon（箱庭副本五幕）
**职责**：AI 生成五幕蓝图副本（sneak/item/combat/explore/boss），临时背包，通关转主背包。**非 SSE（REST 推进）**。

**数据流**：enter生成蓝图+enrichActs → 前端调battle开战 → 胜loot/败fail → next推进 → 末幕通关flushTempToBackpack

**已知问题**：难度写死1（danger_level 未接入）；战斗中前端崩溃无 abort 兜底（玩家永久卡 DUNGEON）；acts 是 mutable JSON 无并发保护。

### 8. encounter（奇遇触发）
**职责**：历练中 10% 触发，分 dungeon/cultivate 两种，pending 上限 10。

**状态流转**：pending → entered（consume）→ done（markDone）/ abandoned

### 9. alchemy（炼丹）
**职责**：丹方学习、丹炉装备、元素能量炼丹（公差匹配 + 杂质比例成功率）、丹房商店。

**炼丹判定**（两阶段）：
1. 硬约束：任一元素超 cap 炸炉；required 元素不在 [need-tol, need+tol] 失败
2. 概率：杂质比例 = impuritySum/neededSum；rate = ratio≤1 ? 0.9 : 0.9/ratio；掷骰

**已知问题**：丹炉耐久/装备状态双源（player 表 + 背包）；报废只清 player.equipped_furnace 不清背包。

### 10. task（佣兵任务/锻造委托）
**职责**：任务 CRUD、佣兵战斗任务预览/接受（pending 上限 3）、锻造委托（每玩家 1 个）、击杀进度推进、NPC 交付发奖。

**已知问题**：
1. **锻造奖励"黑铁剑"被当普通物品入背包**（应是宝物，类型错配）
2. task module 直接注入 Location Repository（绕过 LocationService）
3. `claim` 与 `completeReadyTasks` 状态语义冲突
4. `findAncestorByType` while 循环逐层查询（N 次）

---

## 三、基础数据 + AI/事件系统

### 11. location（地图树/AI懒生成）
**职责**：自上而下无限地图树（continent→region→empire→city/wild→district/wild2→scene/wild3），首次访问 AI 懒生成。

**核心**：`getChildren`（未展开则 expandNode）/ `expandNode`（调 mapGenerator → 写子节点，强制 wild→wild2→wild3，继承 common_mobs）/ `expandAllDescendants`（empire 子树整树 BFS 展开）

**MapGeneratorService**：调 agentClient.generateMap，失败 fallbackGenerate；normalizeTypes 纠正类型；enforceCityMandatory 强制每城各一个 坊市/佣兵公会/丹房。

### 12. npc（静态NPC/懒生成/对话）
**职责**：按 npc_role.required_in_loc_type 懒生成（野外不生成），对话下沉到 agent。

**已知问题**：findByLocation 是 N+1 查询；required_in_loc_type 是 TEXT 存 JSON（类型不一致）。

### 13. dialog-event（NPC快捷对话路由）
**职责**：event.type 路由（createAdventurerTask/completeTask/trade/cultivationRoom/default→talk）。

### 14. item（物品表）
**职责**：全游戏物品单一数据源。含 element_energy（炼丹）、furnace_spec（丹炉）、use_effect（使用效果）。

### 15. backpack（背包/商店）
**职责**：每玩家一行，items JSON 存 [{name,count}]（靠 name 关联 item）。buy/sell/use。

**已知问题**：以 name 关联（item 改名则失联）；JSON 无原子操作（并发竞态）。

### 16. mob/skill/technique/treasure/buff（纯数据 CRUD）
- **mob**：魔兽图鉴运行时副本（WB-/AGENT- 前缀）
- **skill**：斗技，品阶编码 rank，levels 参数表，buff key 数组
- **technique**：功法，growth/base/breakthrough_rate。**K 表严重不完整**（仅配 43 一档）
- **treasure**：宝物，stats+effects，与 item 弱关联（item_id）
- **buff**：数据驱动，fn_id 指向 buff-library 函数

### 17. agent（HTTP客户端）
**职责**：统一收口调 Flask/DeepSeek 的 HTTP。7 个生成方法 + ragSearch。**只负责传输，降级由调用方 catch**。

**已知问题**：无重试；无超时（agent 挂了会拖死调用方）；无 schema 校验（Promise<any>）。

### 18. random-event（场景事件系统）— 最复杂模块
**三表结构**：
- `event_template`：事件模板（manual/agent 来源，probabilistic/push 触发）
- `event_instance`：玩家会话快照（started/in_progress/ended）
- `event_dispatch`：agent 编排派发队列（pending/fired/discarded）

**8 个 effect 原子能力**（EffectRegistry）：money/giveItem/forgeTask/createTask/startBattle/grantCultivation/triggerEncounter/movePlayer

**AgentOrchestrator**：监听领域事件 → 门控（采样率+冷却）→ 上下文 → 调agent → 严格校验 → 入派发队列。

**已知问题**：EventEffect 接口与注册表脱节；condition_met/fire_at 留作扩展未实现。

### 19. event-bus（领域事件）
3 个事件：player.breakthrough / player.kill_mob / player.enter_location。监听器 try/catch 不影响主流程。

---

## 四、前端架构（dqdl-web/src/）

### Stores（13 个）
player / map / game / battle / dungeon / encounter / cultivation / cultivationRoom / techniqueBreakthrough / randomEvent / dialog / backpack / task / overlay

**关键模式**：
- overlay store 做 z-index 中央调度（acquire/release 递增）
- 动态 import 规避循环依赖（game↔cultivation↔randomEvent）
- 双重轮询：事件轮询（60s）+ status 轮询（60s）

### Services（4 个 SSE 编排器）
trainingSession / gatherSession / cultivationSession / cultivationRoomSession — **结构高度重复**（retry/openStream/closeStream 模板），应抽公共工厂。

### Components（12 个）
RolePanel / TaskPanel / SkillPanel / TreasurePanel / AlchemyPanel / DungeonPanel / EncounterPanel / CultivationPanel / CultivationRoomPanel / RandomEventDialog / TechniqueBreakthroughGame / MessageToast

### App.vue（2599 行，巨型单文件）
内联了背包面板、交易面板、整个战斗界面、对话框、地图导航。**应拆分**。

---

## 五、Agent 端（dqdl-agent/）

### app.py（1121 行单文件）
9 个端点：health / generate(map|dialog|training|encounter|breakthrough|dungeon|event) / rag/search

**核心模式**：call_deepseek → parse_json → _normalize_*（校验清洗）→ 失败 _fallback_*（降级）

**EVENT_EFFECT_KEYS 白名单**（与后端 EffectRegistry 一步）：money/giveItem/forgeTask/createTask/startBattle/grantCultivation/triggerEncounter/movePlayer

### rag_service.py
numpy 手搓向量库（paraphrase-multilingual-MiniLM-L12-v2，384 维，1186 chunks）。index/search/get_context。

---

## 六、数据库全表（24 个 entity）

### 玩家相关
- **player**：含大量 JSON 字段（buff/extra_attrs/skill/technique/treasures/recipes/position），status tinyint
- **backpack**：player_id unique, items JSON [{name,count}]
- **task**：target/reward/delivery 均 JSON

### 地图
- **location**：自引用树，common_mobs/gather_herbs/available_actions/tags 均 JSON，无索引
- **location_gen_rule**：每层一条生成规则

### 战斗/养成
- **mob**：mob_id varchar(64)，drops JSON
- **skill/technique/treasure/buff/buff_effect/item/pill_recipe**

### 会话/副本/奇遇
- **dungeon_instance**：acts json（五幕蓝图），temp_items JSON，无索引
- **encounter** / **cultivation_session** / **cultivation_room_session**

### 事件系统
- **event_template** / **event_instance**（有索引）/ **event_dispatch**（有索引）

### NPC
- **static_npc** / **npc_role** / **nature** / **dialog_event**

---

## 七、已知技术债与重构优先级

### 🔴 高优先（运行时崩溃/数据丢失）
| 问题 | 模块 | 说明 |
|---|---|---|
| cultivation-room enter 引用未定义 player | cultivation-room | qi 模式必崩 |
| battle 会话纯内存 | battle | 重启丢失，无持久化 |
| dungeon 无 abort 兜底 | dungeon | 战斗中崩溃永久卡 DUNGEON |
| synchronize:true 默认 | 全局 | 生产改列定义会清数据（已发生过） |
|锻造奖励类型错配 | task | 黑铁剑(宝物)当物品入背包 |

### 🟠 中优先（一致性/性能）
| 问题 | 模块 |
|---|---|
| SSE 会话令牌不统一（training/gather 有，cultivation 系列/dungeon 无） | 全部 SSE 模块 |
| 服务器重启内存态丢失（battle sessions / sessionToken Map） | battle/training/gather |
| findOne 富查询 N+1 | player/npc |
| technique K 表/突破率表严重不完整 | technique |
| updatePosition 状态校验不完整（3/4/6 可移动） | player |
| 快速战斗 vs 回合制数值割裂 | battle |
| JSON 字段无 schema（全靠 try/catch） | 全部 |
| 弱关联无外键（item↔treasure, backpack↔item, skill↔buff） | 全部 |

### 🟡 低优先（架构/可维护性）
| 问题 | 模块 |
|---|---|
| App.vue 2599 行巨型单文件 | 前端 |
| 4 个 SSE session service 结构重复 | 前端 |
| 大量动态 import 规避循环依赖 | 前端 |
| agent app.py 1121 行单文件 | agent |
| 常量重复定义（BASE_QI/TIER_MULT） | cultivation/cultivation-room |
| 管理端点无鉴权（battle seed/equipAll） | battle |
| 文档过期（README "4 个生成接口"实际 7 个） | 文档 |
| DeepSeek key 两处不一致（根.env apikey / server.env DEEPSEEK_API_KEY） | 配置 |

---

## 八、重构建议方向（供讨论）

1. **SSE 会话统一**：抽公共 `createSSESession(config)` 工厂 + 统一会话令牌机制（或全部改 abortActive 幂等）+ 启动时状态自愈
2. **状态持久化**：battle 会话、sessionToken 改 DB 存储（或启动时清理脏状态）
3. **App.vue 拆分**：背包/交易/战斗/对话框抽独立组件
4. **JSON 字段治理**：高频 JSON 字段（player.skill/technique/treasures）考虑独立子表或 JSON column + 校验
5. **配置补全**：technique K 表/突破率表全品阶覆盖
6. **战斗统一**：快速战斗与回合制共用同一套属性/buff 计算
7. **agent 拆分**：app.py 按 Blueprint 拆分（REFACTOR_PLAN 阶段 3）
8. **测试补齐**：后端业务逻辑单测（目前仅纯函数有测）
