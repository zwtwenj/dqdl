# 斗气大陆 · 1.0（重构版）

基于《斗破苍穹》世界观的 AI 文字冒险游戏。本仓库为**重构 1.0 版**：将旧的「单存档 + SSE 采集 + 前端炼丹」架构重构为**网游式「账号 → 多角色 → 进入世界」**流程，三个子项目（前端 / 后端 / AI 服务）职责清晰、独立构建、协同部署。

---

## 架构总览

```
┌──────────────────┐   HTTP(/api)   ┌────────────────────┐   HTTP   ┌──────────────────┐
│   dqdl_web1.0    │ ─────────────▶ │   dqdl_server1.0   │ ───────▶ │    dqdl-agent    │
│ Vue3 · Vite · Pinia│              │ NestJS11 · TypeORM │          │ Flask · DeepSeek │
└──────────────────┘                 └─────────┬──────────┘          └────────┬─────────┘
   /image 代理                                │ TypeORM                        │ sentence-
        │                                     ▼                                ▼  transformers
        ▼                              ┌──────────────┐                ┌──────────────────┐
┌──────────────────┐                   │    MySQL     │                │  RAG 向量库/docx │
│  后端静态图片服务  │                   │  dqdl1.0     │                │   rag/*.docx     │
└──────────────────┘                   └──────────────┘                └──────────────────┘
```

| 子系统 | 目录 | 技术栈 | 职责 |
| --- | --- | --- | --- |
| 前端 | `dqdl_web1.0/` | Vue 3 · Vite 8 · Pinia · Vue Router · Axios | UI、登录/选角/游戏主界面、地图导航、历练/采集面板 |
| 后端 | `dqdl_server1.0/` | NestJS 11 · TypeORM · MySQL · JWT/Passport | 游戏业务 API、全局地图、战斗/修炼、历练调度、鉴权 |
| AI 服务 | `dqdl-agent/` | Python · Flask · OpenAI SDK · sentence-transformers | 调 DeepSeek 生成地图/叙事，管理 RAG 检索 |
| 知识库 | `rag/` | docx 文档 | 世界设定知识源（魔兽/草药/丹药/魔核/经济/佣兵/场景） |
| 流水线 | `.workflow/` | YAML | CI/CD 流水线配置（master/分支/PR 三套） |

**端口约定**：前端 `5173`，后端 `3000`，AI 服务 `5000`。

---

## 核心设计（重构变化）

### 1. 网游式账号体系
旧的「单存档」改为：`user（账号）→ character（角色，每账号最多 3 个 slot）→ player（一个角色对应一个玩家实例）`。
- 注册/登录用 JWT（`@nestjs/jwt` + `passport-jwt`），密码 bcrypt 加密。
- 登录后弹出角色选择弹窗，可新建/选择/删除角色，再 `enterCharacter` 进入世界。

### 2. 全局共享地图
地图从「每个存档独立生成」改为**全局唯一地图树**，所有角色共享。
- 启动时 `LocationService` 检查地图是否初始化（`init.sql` 已种入固定种子），空则补建。
- 子节点懒生成：子列表为空时前端触发 `expandLocation`，后端调 Agent `/generate/map`，失败自动 fallback。
- 前端以当前 `player.location_id` 为数据源，同级（邻近之地）/子级（可达之所）抽屉同步刷新，点击卡片移动。

### 3. 属性与状态由后端权威管理
- 玩家属性真值持久化在 DB（`base_*` + 当前属性），`findOne` 实时聚合 `final_attrs` 返回。
- 活动状态码（空闲/历练/奇遇副本/修炼/采集…）后端统一，活动前 `assertIdle` 校验。
- 等阶成长：`level_cultivation = K × level²`（K 随等阶 100/200/300/400），全属性 1-9 级每级 +3。

### 4. 历练系统（服务端定时器）
后端定时器每 10s 生成一条 AI 叙事日志（调 Agent `/generate/training`），历练到时间自动结束或手动停止。前端轮询 `/training/active` 拉日志。

### 5. 统一响应与异常
后端全局拦截器把所有响应包装为 `{ code, message, data }`，HTTP 状态恒为 200；业务错误走 `Biz` 异常 + `AllExceptionFilter`。前端 `request.js` 拦截器自动解包，`code=1002`（未登录）自动登出跳转。

---

## 目录结构

```
dqdl/
├── dqdl_web1.0/                # 前端（Vue 3）
│   ├── src/
│   │   ├── api/                # 接口层（request.js 拦截器 + 各模块）
│   │   ├── components/         # 玩家信息/地图抽屉/日志面板/弹窗等
│   │   ├── views/              # StartView（登录选角）/ GameView（主界面）
│   │   ├── stores/             # auth（登录态/JWT）/ game（存档/玩家id）
│   │   ├── router/             # hash 路由（/ 起始页，/game 主界面）
│   │   ├── utils/eventBus.js   # 事件总线（toast 跨组件通信）
│   │   └── styles/main.css
│   └── public/icon/            # 切分好的游戏图标（炼丹/魔兽/地点/按钮）
│
├── dqdl_server1.0/             # 后端（NestJS）
│   ├── src/
│   │   ├── main.ts             # 启动：全局管道/拦截器/过滤器 + /api 前缀
│   │   ├── app.module.ts       # TypeORM(MySQL) + 各业务模块装配
│   │   ├── common/             # 统一响应拦截器/异常过滤器/业务码
│   │   ├── auth/               # 注册/登录 + JWT 守卫/策略 + user 实体
│   │   ├── character/          # 角色增删查（user 下最多 3 slot）
│   │   ├── game/               # 游戏入口：创建角色 + 初始化 player
│   │   ├── player/             # 属性系统、修炼、突破、移动、状态机
│   │   ├── location/           # 全局地图树、同级/子级、AI 懒生成
│   │   ├── mob/                # 魔兽图鉴查询
│   │   ├── alchemy/            # 炼丹/物品数据
│   │   ├── item/               # 物品
│   │   ├── training/           # 历练调度（定时器 + AI 叙事日志）
│   │   └── agent/              # 封装对 dqdl-agent 的 HTTP 调用（含降级）
│   ├── migrations/init.sql     # 全量建表 + 固定种子（地图根/区域/生成规则/魔兽/物品/丹药）
│   └── scripts/                # 数据导入脚本（import-mob-alchemy.ts）
│
├── dqdl-agent/                 # AI 服务（Python Flask）
│   ├── app.py                  # 入口：/generate/map /training /dialog /dungeon /event + /health
│   ├── rag_service.py          # 向量库索引与检索（sentence-transformers）
│   └── vector_data/            # 切分 chunks + 向量（已 gitignore）
│
├── rag/                        # 世界设定 docx 知识库
├── .workflow/                  # CI 流水线配置（见下）
├── start.ps1                   # 一键启动脚本（旧版，针对 dqdl-* 目录）
└── .env                        # 根级环境变量（Agent 读 DeepSeek key 等）
```

---

## 数据库（MySQL · `dqdl1.0`）

`migrations/init.sql` 全量建表，网游模式核心表：

| 表 | 说明 |
| --- | --- |
| `user` | 账号（username 唯一，bcrypt 密码哈希） |
| `character` | 角色（user_id + slot 唯一，最多 3 个） |
| `player` | 玩家实例（一个 character 一个 player，属性 + location_id + status） |
| `location` | 全局地图树（parent_id 自关联，depth/loc_type/danger_level/qi_density/common_mobs/common_herbs） |
| `location_gen_rule` | AI 生成规则（按 depth/loc_type 的命名/危险度/数量约束 + prompt） |
| `mob` / `item` / `alchemy` | 魔兽 / 物品 / 炼丹图鉴 |
| `training` / `training_log` | 历练实例 + 叙事日志 |

初始化：
```bash
mysql -u root -p -e "CREATE DATABASE \`dqdl1.0\` CHARACTER SET utf8mb4;"
mysql -u root -p dqdl1.0 < dqdl_server1.0/migrations/init.sql
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
```

> ⚠️ `.env` 已在 `.gitignore` 中，密钥勿入库。

---

## 快速开始

### 环境要求
- Node.js ≥ 18，npm
- Python ≥ 3.10，pip
- MySQL ≥ 8
- [DeepSeek API Key](https://platform.deepseek.com/)

### 安装与初始化
```bash
# 1. 建库 + 导入 init.sql（见上节）

# 2. 后端
cd dqdl_server1.0
npm install

# 3. 前端
cd ../dqdl_web1.0
npm install

# 4. AI 服务
cd ../dqdl-agent
pip install flask openai python-dotenv numpy python-docx
pip install sentence-transformers
# 构建 RAG 索引（首次约 1-2 分钟）
python rag_service.py index
```

### 启动（三个进程）
```bash
# 终端 1：AI Agent（:5000）
cd dqdl-agent
python app.py

# 终端 2：后端 API（:3000）
cd dqdl_server1.0
npm run start:dev

# 终端 3：前端（:5173，dev 代理 /api、/image 到 :3000）
cd dqdl_web1.0
npm run dev
```
打开 http://localhost:5173 → 注册账号 → 新建角色 → 进入世界。

---

## 构建

| 子系统 | 命令 | 产物 |
| --- | --- | --- |
| 后端 | `cd dqdl_server1.0 && npm run build` | `dqdl_server1.0/dist/`（生产用 `node dist/main.js`） |
| 前端 | `cd dqdl_web1.0 && npm run build` | `dqdl_web1.0/dist/`（静态站点） |
| AI 服务 | 无构建，直接 `python app.py` | — |

前端 `vite.config.js` dev 代理：`/api`、`/image` → `http://localhost:3000`。生产部署需自行配置反向代理。

---

## CI/CD 流水线（`.workflow/`）

仓库内置三套 YAML 流水线（当前为 Maven 模板占位，**需按实际技术栈改写**）：

| 文件 | 触发 | 用途 |
| --- | --- | --- |
| `master-pipeline.yml` | push 到 `master` | 编译 → 上传制品 → 发布（版本自增） |
| `branch-pipeline.yml` | push 到任意非 master 分支 | 编译 → 上传制品 |
| `pr-pipeline.yml` | 向 master 发起 PR | 编译 → 上传制品（校验） |

**改造建议**（对接实际三个子项目）：
- 后端：`npm ci && npm run build`，产物 `dqdl_server1.0/dist`，生产 `node dist/main.js`
- 前端：`npm ci && npm run build`，产物 `dqdl_web1.0/dist`，部署到静态服务器/CDN
- AI 服务：安装 Python 依赖，无需编译，按需构建 RAG 索引

> ⚠️ 现有 YAML 是 `build@maven` 模板（`mvn clean package`），与本项目的 Node/Python 技术栈不符，建立流水线时务必替换为对应构建步骤。

---

## 主要接口速览（后端 `/api`）

| 模块 | 方法 | 路径 |
| --- | --- | --- |
| 鉴权 | POST | `/api/auth/login`、`/api/auth/register` |
| 角色 | GET/POST/DELETE | `/api/character`、`/api/game/create`、`/api/game/enter/:slot`、`/api/game/delete/:slot` |
| 玩家 | GET/POST | `/api/player/:id`、`/api/player/:id/status`、`/api/player/:id/cultivate`、`/api/player/:id/breakthrough`、`/api/player/:id/move` |
| 地图 | GET/POST | `/api/location/root`、`/api/location/:id`、`/api/location/:id/children`、`/api/location/:id/siblings`、`/api/location/:id/expand` |
| 历练 | GET/POST | `/api/training/start`、`/api/training/stop`、`/api/training/active` |

Agent 内部接口（:5000）：`POST /generate/map`、`/generate/training`、`/generate/dialog`、`/generate/dungeon`、`/generate/event`，`POST /rag/search`，`GET /health`。

统一响应体：`{ code, message, data }`，`code === 0` 为成功，`1002` 为未登录。

---

## 注意事项

- `.env` 与 `dqdl-agent/vector_data/` 已 gitignore，勿提交密钥与模型缓存。
- 后端 TypeORM 使用 `synchronize: false`，表结构以 `init.sql` 为准（重构版已改为显式迁移，更安全）。
- Agent 启动强制 HuggingFace 离线模式（`TRANSFORMERS_OFFLINE=1`），首次构建 RAG 索引需联网下载模型，之后离线可用。
- `start.ps1` 仍指向旧目录名（`dqdl-server` / `dqdl-web`），重构版需改为 `dqdl_server1.0` / `dqdl_web1.0`。

---

## License

个人学习/作品展示用途，世界观版权归《斗破苍穹》原作者所有。
