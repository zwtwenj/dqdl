# 斗气大陆 · 1.0（重构版）

基于《斗破苍穹》世界观的 AI 文字冒险游戏。本仓库为**重构 1.0 版**：将旧的「单存档 + SSE 采集 + 前端炼丹」架构重构为**网游式「账号 → 多角色 → 进入世界」**流程；地图由树状改为**网状平面图**；并新增**奇遇/秘境/丹药/战斗**等玩法与独立的**游戏管理平台**。四个子项目职责清晰、独立构建、协同部署。

---

## 架构总览

```
┌──────────────────┐   HTTP(/api)   ┌────────────────────┐   HTTP   ┌──────────────────┐
│   dqdl_web1.0    │ ─────────────▶ │   dqdl_server1.0   │ ───────▶ │    dqdl-agent    │
│ Vue3 · Vite · Pinia│              │ NestJS · TypeORM   │          │ Flask · 多平台LLM│
└──────────────────┘                 └─────────┬──────────┘          └────────┬─────────┘
                                                │ TypeORM                       │ sentence-
                                                ▼                                ▼  transformers
                                         ┌──────────────┐                ┌──────────────────┐
                                         │    MySQL     │                │  RAG 向量库/docx │
                                         │  dqdl1.0     │                │   rag/*.docx     │
                                         └──────┬───────┘                └──────────────────┘
                                                ▲ 只读
┌──────────────────┐   HTTP(/api)   ┌───────────┴──────────┐
│ dqdl_admin_web   │ ─────────────▶ │     dqdl_admin       │
│ Vue3 · Element+  │                │ NestJS · 独立JWT     │
│ · ECharts        │                │ · 独立 admin_users   │
└──────────────────┘                └──────────────────────┘
```

| 子系统 | 目录 | 技术栈 | 职责 |
| --- | --- | --- | --- |
| 游戏前端 | `dqdl_web1.0/` | Vue 3 · Vite · Pinia · Vue Router · Axios | UI、登录/选角/游戏主界面、地图导航、历练/秘境/背包/战斗面板 |
| 游戏后端 | `dqdl_server1.0/` | NestJS · TypeORM · MySQL · JWT/Passport | 游戏业务 API、网状地图、战斗/修炼/突破、历练调度、奇遇/秘境、鉴权 |
| AI 服务 | `dqdl-agent/` | Python · Flask · OpenAI SDK · sentence-transformers | 调多平台 LLM 生成地图/叙事/对话/副本/事件，管理 RAG 检索 |
| 知识库 | `rag/` | docx 文档 | 世界设定知识源（魔兽/草药/丹药/魔核/经济/佣兵/场景） |
| **管理后端** | `dqdl_admin/`` | NestJS · TypeORM · 独立 JWT | **只读**查看 agent 日志（聚合+明细）、数据库表内容浏览 |
| **管理前端** | `dqdl_admin_web/` | Vue 3 · Vite · Element Plus · ECharts | 管理平台 UI：日志可视化图表、表数据浏览 |

**端口约定**：游戏前端 `5173`，游戏后端 `3000`，AI 服务 `5000`，**管理前端 `5174`，管理后端 `4000`**。

> 管理平台与游戏后端**完全隔离**（独立进程、独立 JWT secret、独立 admin_users 表），仅共享同一个只读数据库。玩家 token 与管理员 token 互不互通。

---

## 核心设计（重构变化）

### 1. 网游式账号体系
旧的「单存档」改为：`user（账号）→ character（角色，每账号最多 3 个 slot）→ player（一个角色对应一个玩家实例）`。
- 注册/登录用 JWT（`@nestjs/jwt` + `passport-jwt`），密码 bcrypt 加密。
- 登录后弹出角色选择弹窗，可新建/选择/删除角色，再 `enterCharacter` 进入世界。

### 2. 网状平面地图（重构版核心变化）
地图从老版「树状邻接表（parent_id 层级包含）」重构为**网状平面图**（`location_net` + `location_edge`），解决树状图"只能上下移动、无方位距离、无法成环"的根本问题。
- **平面网格坐标**：每个节点有 `gx/gy` 整数网格坐标，4 对角（X 形）邻接，可成环、可多路径。
- **显式出口桩拓展**：边缘节点（`is_frontier`）预声明未知方向出口，玩家点了未知出口才触发 `expandFrontier` 调 Agent 生成新节点（带方向/距离），无限向外生长。
- **loc_type 分布**：server 按 `game.config` 的概率分布（60% wild / 25% city / 10% sect / 5% secret）掷骰定类型，Agent 只生成名称/描述/文案。
- **场景层**：城市节点内部有 `location_scene`（佣兵公会/坊市/炼药师公会等），进入场景才能与 NPC 交互。
- 玩家位置双状态：`player.location_id`（地图节点）+ `player.scene_id`（场景，可空）。

### 3. 属性与状态由后端权威管理
- 玩家属性真值持久化在 DB（`base_*` + 当前属性），`findOne` 实时聚合 `final_attrs` 返回（含已装备功法加成）。
- 活动状态码（1 空闲 / 2 历练 / 3 秘境 / 4-5 修炼 / 6 采集 / 7 战斗）后端统一，活动前校验空闲。
- 等阶成长：`level_cultivation = K × level²`（K 随等阶 100/200/300/400），全属性 1-9 级每级 +3。

### 4. 历练系统（服务端定时器 + 奇遇触发）
- 后端定时器（间隔/时长见 `game.config`，可被 `.env` 覆盖）每 tick 生成一条 AI 叙事日志（调 Agent `/generate/training`），叙事会体现玩家已装备的功法/斗技名。
- **奇遇触发**：每个 tick 有 `ENCOUNTER.triggerRate`（默认 10%）概率发现副本入口/洞天福地，入玩家奇遇列表（最多 `maxPending` 个）。
- 前端轮询 `/training/active` 拉日志，发现奇遇日志时 Toast 提示 + 功能栏红点。

### 5. 奇遇 / 秘境 / 战斗
- **奇遇**（`encounter` 表）：历练中发现，分 dungeon（秘境入口）/ cultivate（洞天福地），状态 pending→entered→done/abandoned。
- **秘境**（`dungeon_instance` 表）：AI 生成五幕蓝图（`/generate/dungeon`，第 5 幕固定 BOSS）+ 后端按地图等阶装配魔兽/魔核奖励。进度全落库（acts JSON + current_act 游标），刷新可恢复；战斗复用全局 BattleService。
- **战斗**（`battle` 引擎）：回合制 + 钩子式 buff 系统（buff/buff_effect 表数据驱动，可执行逻辑在代码 `buff-library`）。秘境战斗结束自动回秘境状态（DUNGEON），普通战斗回空闲。

### 6. 丹药 / 背包 / 商店
- **丹药**（`pill` 表）：右键背包丹药即用，单事务扣背包+应用效果（回血/回气/加属性），上限含功法加成。
- **背包**（`backpack` 表，350 格）：grant/addItem/removeItem 均带事务+行锁+流水日志。商店买卖、秘境掉落、历练掉落统一走 grant。
- **NPC 商店**（`npc_shop` 表，role 维度配货）：对话弹窗点「交易」打开，支持 Shift+点击批量购买。

### 7. 管理平台（独立项目）
- **agent 日志可视化**：ECharts 展示 token 占比饼图 / 趋势折线 / 耗时柱状，支持时间范围切换；调用明细 + 对话明细（含完整 messages 快照）分页。
- **数据库只读浏览**：自动发现 `information_schema` 全部表 + 字段 + 分页数据，表名严格校验防注入，纯只读。
- 详见 `dqdl_admin/` 与 `dqdl_admin_web/`，启动：`cd dqdl_admin && npm run start:dev`（:4000）+ `cd dqdl_admin_web && npm run dev`（:5174），默认账号 `admin/123456`。

### 8. 统一响应与异常
游戏后端全局拦截器把所有响应包装为 `{ code, message, data }`，HTTP 状态恒为 200；业务错误走 `Biz` 异常 + `AllExceptionFilter`。前端 `request.js` 拦截器自动解包，`code=1002`（未登录）自动登出跳转。
> 管理后端直接返回业务对象（不走 `{code,message,data}` 包装），错误统一 HTTP 状态码（401/400/500）。

### 9. 业务配置集中化
`dqdl_server1.0/src/config/game.config.ts` 集中管理核心业务参数（历练时长/间隔/胜率、奇遇触发率/上限、地图分布、背包/角色容量上限），带类型 + 注释，与项目 `export const` 风格一致。运维参数（历练时长/间隔）可由 `.env` 覆盖。

---

## 目录结构

```
dqdl/
├── dqdl_web1.0/                # 游戏前端（Vue 3）
│   ├── src/
│   │   ├── api/                # 接口层（request.js 拦截器 + 各模块）
│   │   ├── components/         # 背包/角色/斗技/战斗/历练日志/奇遇/秘境/NPC对话/商店 等面板
│   │   ├── views/              # StartView（登录选角）/ GameView（主界面）
│   │   ├── stores/             # auth / backpack
│   │   ├── composables/        # usePanelStack（层级）/ usePanelDraggable（拖拽）
│   │   ├── router/             # hash 路由（/ 起始页，/game 主界面）
│   │   └── utils/eventBus.js   # 事件总线
│   └── public/icon/            # 游戏图标
│
├── dqdl_server1.0/             # 游戏后端（NestJS）
│   ├── src/
│   │   ├── main.ts             # 启动：全局管道/拦截器/过滤器 + /api 前缀
│   │   ├── app.module.ts       # TypeORM(MySQL) + 各业务模块装配
│   │   ├── common/             # 统一响应拦截器/异常过滤器/业务码
│   │   ├── config/game.config.ts # 业务配置集中（概率/时长/容量/地图分布）
│   │   ├── auth/               # 注册/登录 + JWT 守卫/策略 + user 实体
│   │   ├── character/          # 角色增删查（每号最多 3 slot）
│   │   ├── game/               # 游戏入口：创建角色 + 初始化 player
│   │   ├── player/             # 属性系统、修炼、突破、状态机
│   │   ├── location_net/       # 网状平面地图（节点+边+场景，懒拓展）
│   │   ├── location/           # 旧树状地图（兼容保留）
│   │   ├── mob/ item/ alchemy/ # 魔兽/物品/草药图鉴
│   │   ├── pill/               # 丹药效果定义 + 使用（单事务）
│   │   ├── backpack/           # 背包 + 流水日志（grant/remove 事务+行锁）
│   │   ├── shop/ npc/          # NPC 商店（role 配货）+ 静态 NPC + 对话会话
│   │   ├── training/           # 历练调度（定时器 + AI 叙事 + 奇遇触发）
│   │   ├── encounter/          # 奇遇（发现副本入口/洞天福地）
│   │   ├── dungeon/            # 秘境（AI 五幕蓝图 + 装配 + 推进 + 战斗）
│   │   ├── battle/             # 回合制战斗引擎 + buff 钩子系统
│   │   ├── technique/ skill/ buff/ # 功法/斗技/buff 定义
│   │   └── agent/              # 封装对 dqdl-agent 的 HTTP 调用（含降级）
│   └── migrations/             # 显式迁移 SQL（init.sql + 各增量 add_*.sql）
│
├── dqdl-agent/                 # AI 服务（Python Flask）
│   ├── app.py                  # 入口：/generate/* + /health
│   ├── config.py               # 多平台 LLM 路由（按场景选模型）+ RAG 懒加载
│   ├── llm_client.py           # 统一 LLM 调用 + token 记录
│   ├── routes/                 # map/training/dialog/dungeon/encounter/breakthrough/event
│   ├── services/               # 各场景 normalize + fallback 降级
│   ├── rag_service.py          # 向量库索引与检索（sentence-transformers）
│   └── db.py                   # agent_call_log / agent_dialog_call 写入
│
├── dqdl_admin/                 # 管理后端（NestJS，独立鉴权）
│   ├── src/
│   │   ├── auth/               # admin_users + 独立 JWT
│   │   ├── agent-log/          # agent 日志聚合（summary/trend）+ 明细分页
│   │   └── db-viewer/          # information_schema 自动发现 + 只读数据浏览
│   └── migrations/admin_users.sql
│
├── dqdl_admin_web/             # 管理前端（Vue3 + Element Plus + ECharts）
│   └── src/
│       ├── views/              # Login / Dashboard(ECharts) / AgentLog / AgentDialog / DbViewer
│       ├── layouts/            # 侧边菜单布局
│       └── api/                # request.js + auth/agentLog/db
│
├── rag/                        # 世界设定 docx 知识库
├── docs/                       # 设计文档（地图重构/架构基线/agent编排等）
└── .env                        # 根级环境变量（Agent 读 DeepSeek key 等）
```

---

## 数据库（MySQL · `dqdl1.0`）

`migrations/` 下显式迁移 SQL（`init.sql` 全量建表 + 各 `add_*.sql` 增量）。核心表：

| 表 | 说明 |
| --- | --- |
| `user` / `character` / `player` | 账号 / 角色（每号最多3）/ 玩家实例（属性+位置+status） |
| `location_net` / `location_scene` | **网状平面地图节点（gx/gy 网格+frontier）/ 城市场景** |
| `location` / `location_gen_rule` | 旧树状地图（兼容）+ 生成规则 |
| `mob` / `item` / `alchemy` / `pill` | 魔兽/物品/草药/丹药图鉴 |
| `backpack` / `backpack_log` | 背包（slot 1-350）/ 流水日志 |
| `training` / `training_log` | 历练实例 + 叙事日志（含奇遇日志） |
| `encounter` / `dungeon_instance` | 奇遇（秘境入口/洞天）/ 秘境实例（五幕 acts JSON） |
| `battle_log` / `buff` / `buff_effect` | 战斗日志 / buff 定义 / buff 效果子表 |
| `technique` / `skill` | 功法 / 斗技定义 |
| `static_npc` / `npc_role` / `nature` / `npc_shop` / `dialog_event` / `dialog_session` | NPC 实例/职能/性格/商店配货/对话事件/对话会话 |
| `agent_call_log` / `agent_dialog_call` | **agent LLM 调用日志（token 账单）/ 对话调用明细（messages 快照）** |
| `admin_users` | 管理平台账号（独立于 user 表） |

初始化：
```bash
mysql -u root -p -e "CREATE DATABASE \`dqdl1.0\` CHARACTER SET utf8mb4;"
mysql -u root -p dqdl1.0 < dqdl_server1.0/migrations/init.sql
# 依次执行各 add_*.sql 增量迁移
# 管理平台表：
mysql -u root -p dqdl1.0 < dqdl_admin/migrations/admin_users.sql
```

---

## 环境变量

**根目录 `.env`**（`dqdl-agent/app.py` 读取 `../.env`）：
```ini
apikey=sk-你的DeepSeek密钥          # 兼容 DEEPSEEK_API_KEY
base_url=https://api.deepseek.com   # 兼容 DEEPSEEK_BASE_URL
AGENT_PORT=5000
AGENT_HOST=0.0.0.0
```

**`dqdl_server1.0/.env`**：
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_DATABASE=dqdl1.0
APP_PORT=3000
AGENT_URL=http://localhost:5000
TRAINING_INTERVAL=10000      # 历练日志间隔（覆盖 game.config 默认）
TRAINING_MAX_DURATION=180000 # 历练总时长（覆盖 game.config 默认）
```

**`dqdl_admin/.env`**（管理后端，连同一个只读库）：
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的密码
DB_DATABASE=dqdl1.0
ADMIN_PORT=4000
JWT_SECRET=独立的管理JWT密钥
ADMIN_DEFAULT_USERNAME=admin
ADMIN_DEFAULT_PASSWORD=123456
```

> ⚠️ 所有 `.env` 已在 `.gitignore` 中，密钥勿入库。

---

## 快速开始

### 环境要求
- Node.js ≥ 18，npm
- Python ≥ 3.10，pip
- MySQL ≥ 8
- [DeepSeek API Key](https://platform.deepseek.com/)

### 安装与初始化
```bash
# 1. 建库 + 导入迁移 SQL（见上节）

# 2. 游戏后端
cd dqdl_server1.0 && npm install

# 3. 游戏前端
cd ../dqdl_web1.0 && npm install

# 4. AI 服务
cd ../dqdl-agent
pip install flask openai python-dotenv numpy python-docx sentence-transformers
python rag_service.py index   # 构建 RAG 索引（首次约 1-2 分钟）

# 5. 管理平台（可选）
cd ../dqdl_admin && npm install
cd ../dqdl_admin_web && npm install
```

### 启动
```bash
# 游戏三进程
cd dqdl-agent && python app.py              # :5000 AI 服务
cd dqdl_server1.0 && npm run start:dev      # :3000 游戏后端
cd dqdl_web1.0 && npm run dev               # :5173 游戏前端

# 管理平台（可选，独立）
cd dqdl_admin && npm run start:dev          # :4000 管理后端
cd dqdl_admin_web && npm run dev            # :5174 管理前端
```
打开 http://localhost:5173 → 注册账号 → 新建角色 → 进入世界。
管理平台：http://localhost:5174 → `admin/123456` 登录。

---

## 构建

| 子系统 | 命令 | 产物 |
| --- | --- | --- |
| 游戏后端 | `cd dqdl_server1.0 && npm run build` | `dist/`（生产 `node dist/main.js`） |
| 游戏前端 | `cd dqdl_web1.0 && npm run build` | `dist/`（静态站点） |
| 管理后端 | `cd dqdl_admin && npm run build` | `dist/`（生产 `node dist/main.js`） |
| 管理前端 | `cd dqdl_admin_web && npm run build` | `dist/`（静态站点） |
| AI 服务 | 无构建，直接 `python app.py` | — |

游戏前端 `vite.config.js` dev 代理：`/api`、`/image` → `http://localhost:3000`。生产部署需自行配置反向代理。

---

## 主要接口速览（游戏后端 `/api`）

| 模块 | 方法 | 路径 |
| --- | --- | --- |
| 鉴权 | POST | `/api/auth/login`、`/api/auth/register` |
| 角色/游戏 | GET/POST/DELETE | `/api/character`、`/api/game/create`、`/api/game/enter/:slot` |
| 玩家 | GET/POST | `/api/player/:id`、`/api/player/:id/cultivate`、`/api/player/:id/breakthrough` |
| **网状地图** | GET/POST | `/api/location-net/graph`、`/pos`、`/view`、`/:id/exits`、`/:id/expand`、`/move/:netId`、`/:netId/scene/:sceneType/enter`、`/scene/exit` |
| 历练 | GET/POST | `/api/training/start`、`/stop`、`/active` |
| 背包 | GET/POST | `/api/backpack/:playerId`、`/:playerId/move`、`/:playerId/sort` |
| 商店 | GET/POST | `/api/shop/npc/:npcId`、`/buy`、`/sell` |
| 丹药 | POST | `/api/pill/:playerId/use` |
| 奇遇 | GET/POST | `/api/encounter`、`/api/encounter/:id/abandon` |
| 秘境 | GET/POST | `/api/dungeon/enter`、`/current`、`/next`、`/escape`、`/win`、`/fail` |
| 战斗 | GET/POST | `/api/battle/start`、`/action`、`/state`、`/flee` |

Agent 内部接口（:5000）：`POST /generate/{map,training,dialog,dungeon,encounter,breakthrough,event}`，`POST /rag/search`，`GET /health`。

游戏后端统一响应体：`{ code, message, data }`，`code === 0` 为成功，`1002` 为未登录。

管理后端接口（:4000，独立 JWT）：`POST /api/auth/login`；`GET /api/agent-log/{summary,trend,list}`、`/api/agent-dialog/list`；`GET /api/db/tables`、`/api/db/tables/:table/{columns,data}`。

---

## 注意事项

- 所有 `.env` 与 `vector_data/`、`node_modules/`、`dist/` 已 gitignore，勿提交密钥与缓存。
- 游戏后端 TypeORM 使用 `synchronize: false`，表结构以 `migrations/*.sql` 为准（显式迁移，更安全）。管理后端 `admin_users` 用手动 SQL 建（关闭 synchronize 避免重复启动建表报错）。
- Agent 按业务场景路由到不同 LLM 平台/模型（`config.py` 的 `_ROUTES`），高频低关注场景（如历练）用便宜模型，玩家直接交互场景（如对话）用高质量模型。推理模型自动关闭思考省 token。
- Agent 是无状态 LLM 网关，**不查业务数据**，所有上下文（玩家功法/斗技/魔兽等）由游戏后端预填进请求体。
- Agent 启动强制 HuggingFace 离线模式，首次构建 RAG 索引需联网下载模型，之后离线可用。

---

## License

个人学习/作品展示用途，世界观版权归《斗破苍穹》原作者所有。
