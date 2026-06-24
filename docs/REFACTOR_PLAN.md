# DQDL 全栈解耦重构计划

> 目标：解决三子系统（dqdl-server / dqdl-web / dqdl-agent）的模块耦合问题。
> 策略：全栈、大刀阔斧一次性；对外 API 可随前端一起调；**当前无验证手段，故先建立行为安全网再动结构**。

## ✅ 完成状态（全栈 100 项测试绿色：后端 55 单测 + 6 e2e / 前端 18 / Agent 21）

| 阶段 | 状态 | 说明 |
|---|---|---|
| 0 安全网 | ✅ 完成 | 后端纯函数单测、黄金路径 e2e（真实 DB+桩 Agent）、前端 vitest、Agent pytest |
| 1.1 AgentClient | ✅ 完成 | 全局 `src/agent/agent.client.ts` 收口 5 处 fetch；消除 `process.env` 直读；NPC 对话下沉到 NpcService |
| 1.2 战斗统一 | ✅ 完成 | `classifyQuickBattle`+`resolveQuickBattle` 入 BattleService；Training 改调它，删除重复算法；BattleService 改注入 Buff/Skill Service |
| 1.3 Training 独立 | ✅ 完成 | 新建 `src/training/`，路由 `/location/training`→`/training`；LocationModule 从 7 个依赖瘦身到仅 Mob |
| 1.4 灭跨表 SQL | ✅ 完成 | task 不再 `.manager` 查 static_npc/player（改 NpcService/PlayerService.grantMoney）；backpack.controller 去掉 Item Repository 与跨表 SQL（下沉 BackpackService）；npc/dungeon 改走对应 Service |
| 1.5 拆 BattleService | ✅ 完成 | seed/DDL/SEED 常量外移到 `battle.seed.ts`（BattleSeeder）；运行时与种子/管理工具分离 |
| 2.1 删死码 | ✅ 完成 | 删除 `game/useGame.js`（691 行零引用） |
| 2.2 拆 God Store | ✅ 完成 | SSE 抽到 `src/services/trainingSession.js`；修炼/突破数据更新下沉到 player store；game store 不再直写 playerStore.data |
| 2.3 解 task↔dialog | ✅ 完成 | task.js 去掉对 dialog 的反向 import；新增 task.setLoading，dialog 不再直写兄弟 store 字段 |
| 2.4 API 收口 | ✅ 完成 | battle 端点加入 api/index.js 命名导出，battle.js 去掉硬编码 URL |
| 2.5 抽面板+CSS | ⏸ 延后 | 机械/视觉重构，需浏览器验证视觉回归；不属耦合问题。建议后续在能可视化验证时执行 |
| 3 Agent 拆分 | ⏸ 延后 | Agent 是耦合最轻子系统（单文件 LLM/RAG 代理）；路由含 DeepSeek 调用，现有测试无法覆盖拆分后行为。建议作为独立低优先任务 |

> 期间发现的 lint 基线（全仓库 759 问题）为既有历史问题，package.json 的 lint 带 `--fix`；项目级 lint 清理建议作为独立任务。

---

## 事实基线
- 后端：jest + supertest 已装，仅 1 个样板 spec；`npm test` 可跑。
- 前端：package.json 无任何测试框架。
- Agent：无测试，但所有 `fallback_*` 分支确定性可固定。
- 启动入口：根目录 `start.ps1`。

## 执行顺序
```
阶段0(安全网) ──必须绿──▶ 阶段1(后端) ──e2e绿──▶ 阶段2(前端)
                                          └──并行──▶ 阶段3(Agent) ──▶ 阶段4
```
每阶段结束跑对应基线，红则停下修，不滚雪球。

---

## 阶段 0 — 建立行为安全网（前置必备）

### 0.1 后端纯函数单测（jest）
固定下列输入/输出断言（重构重点搬运对象，行为不可变）：
- 修炼公式、突破成功率（`player.service.ts`）
- 训练胜率档表（`training.service.ts:178-209`）
- battle-engine 回合结算（`battle-engine.ts`）
- skill 解析 `parseScaling`（`skill.service.ts`）
- `levelName` / `expandAllDescendants`（`location.service.ts`）

### 0.2 后端黄金路径 e2e（supertest，`test/game-flow.e2e-spec.ts`）
串起：建玩家 → 修炼满 → 突破 → 历练（胜/负）→ 掉落 → 任务进度推进。

### 0.3 前端引入 vitest
- 加 `vitest` + `@vue/test-utils` devDep
- `game/constants.js` 的 `levelName` 快照
- 8 个 store 关键 action 写 mock-api 断言测试

### 0.4 Agent 契约测试（pytest）
对 5 个 `/generate/*` 的 `fallback_*` 分支固定输入 → 固定输出。

---

## 阶段 1 — 后端解耦（核心，耦合根因）

### 1.1 统一 `AgentClient`
- 新建 `src/agent/agent.client.ts` + `agent.module.ts`（`@Global()`）
- 暴露 `generateMap / generateDialog / generateTraining / generateBreakthrough / generateDungeon / ragSearch`
- 统一从 `ConfigService` 读 `AGENT_URL`（删除 `player.service.ts:217` 直读 `process.env`）、统一 `try/fetch/catch/fallback`
- 5 处调用点改造；`npc.controller.ts:48` 的 LLM 调用下沉到 `NpcService`

### 1.2 战斗结算统一
- `BattleService` 新增 `resolveQuickBattle(player, mob)`，搬入 `training.service.ts:178-209` 的胜率档
- `TrainingService` 改调 `BattleService`，删自身算法
- `battle.module.ts` 导入 `BuffModule`/`SkillModule`；`BattleService` 改注入 `BuffService`/`SkillService`，删除 `battle.service.ts:46-48` 直接 Repository 注入与 `158-183` 重复 `resolveSkills`

### 1.3 `Training` 提升为独立模块
- 新建 `src/training/`，从 `location/` 迁出 `training.service.ts` + controller
- `location.module.ts` 去掉对 `Task/Skill/Backpack/Item` 的导入（大幅瘦身）
- 路由 `/location/training` → `/training`，前端跟随调整

### 1.4 灭跨表原生 SQL 与 Controller 越权
| 位置 | 改造 |
|---|---|
| `task.service.ts:168-173` | 改调 `NpcService` |
| `task.service.ts:305-309` | 改调 `PlayerService.grantMoney`（新增） |
| `backpack.controller.ts:12-13,93-105` | Repository + 跨表 SQL 下沉 `BackpackService` |
| `npc.service.ts:24-25` | Location Repository → 注入 `LocationService` |
| `dungeon.service.ts:41-44` | Mob/Item Repository → `MobService`/`ItemService` |

### 1.5 拆 `BattleService`
- DDL + 种子常量（`battle.service.ts:213-275,302-361`）移到 `battle.seed.ts` + migration
- 运行时回合调度保留

---

## 阶段 2 — 前端解耦

### 2.1 删死码
- 删除 `game/useGame.js`（691 行，零引用）

### 2.2 拆 God Store + 引入 service 编排层
- 新建 `src/services/`：`trainingSession.js`（迁 `game.js:200-261` SSE）、`gameOrchestrator.js`（迁 `newGame/continueGame`）
- `game.js` 只留自身 state，禁止直接写兄弟 store 私有字段
- `player.js` 补 `doCultivate/doBreakthrough`；`RolePanel` 改用 player store
- 新增 `skill` store；`SkillPanel.vue:60` 不再直连 api

### 2.3 解 `task ↔ dialog` 双向依赖
- 单向数据流：dialog 产生事件 → 调 task 公共 action
- `task.js:5` 不再 import dialog；`dialog.js:61,85,88,105` 改调 `taskStore.setActionLoading()`

### 2.4 API 收口
- battle 端点加入 `api/index.js` 命名导出；`battle.js:67,87` 删硬编码 URL
- 所有跨 store 访问经 store action

### 2.5 组件抽取 + CSS 治理
- 抽 6 内联面板：`DialogPanel / BackpackPanel / TradePanel / TrainingFloat / BattleScreen / StartScreen`
- App.vue 的 1850 行全局 CSS 分发到各 `<style scoped>`
- 目标：App.vue < 300 行

---

## 阶段 3 — Agent 解耦（可与阶段 2 并行）

### 3.1 拆 `app.py`（~740 行单文件）
- `routes/`：`map.py / dialog.py / training.py / breakthrough.py / dungeon.py`，各为 Flask Blueprint
- `prompts/`：迁出 `build_prompt / _fetch_real_mobs / _build_rank / _enrich_qi_density`
- `services/rag.py` 封装检索
- `app.py` 只做 app 工厂 + 注册蓝图

### 3.2 scripts 治理
- 52 个脚本按 `check/fix/migrate/parse/gen` 归子目录，标注保留/废弃

---

## 阶段 4 — 收口验证
1. 重跑阶段 0 全部基线测试，全绿
2. `start.ps1` 手动黄金路径：修炼→突破→历练→战斗→掉落→任务→斗技→副本
3. `npm run lint` / `tsc --noEmit` / prettier 全过
