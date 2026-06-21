# 斗气大陆 · AI 文字冒险

基于《斗破苍穹》世界观打造的 AI 文字冒险游戏。游戏地图、NPC 对话、战斗叙事、突破剧情均由大模型实时生成，搭配本地 RAG 向量库保证世界设定的一致性。

---

## ✨ 特性一览

- **无限地图**：树形懒加载生成，玩家探索到哪生成到哪（大陆 → 区域 → 帝国 → 城市/野外 → 内部区域 → 具体场景）
- **AI 即时叙事**：历练、突破、对话文本全部由 DeepSeek 实时生成，风格贴近原著
- **RAG 世界设定**：300+ 魔兽、100+ 草药、丹药/魔核/经济体系等设定以向量库形式注入 Prompt
- **完整 RPG 玩法**：修炼、突破、历练、掉落、背包、任务、佣兵公会、斗技/功法系统
- **智能 NPC**：每张地图按职业规则动态生成 NPC，对话符合性格与职能设定
- **本地存档**：玩家位置/进度持久化到 MySQL，浏览器 localStorage 记录玩家 ID

---

## 🏗️ 架构总览

```
┌──────────────┐   HTTP   ┌────────────────┐   HTTP   ┌──────────────────┐
│   dqdl-web   │ ───────▶ │  dqdl-server   │ ───────▶ │   dqdl-agent     │
│  Vue3 + Vite │          │ NestJS+TypeORM │          │  Flask+DeepSeek  │
└──────────────┘          └───────┬────────┘          └────────┬─────────┘
                                  │ TypeORM                    │ sentence-
                                  ▼                            ▼  transformers
                          ┌──────────────┐            ┌──────────────────┐
                          │    MySQL     │            │  RAG 向量库/docx │
                          │  游戏数据库   │            │   rag/*.docx     │
                          └──────────────┘            └──────────────────┘
```

| 子系统 | 技术栈 | 职责 |
| --- | --- | --- |
| `dqdl-web` | Vue 3 · Vite · Pinia · Axios | 前端 UI、地图导航、对话面板、背包/任务/斗技 |
| `dqdl-server` | NestJS 11 · TypeORM · MySQL | 游戏主业务 API、地图生成调度、战斗计算、存档 |
| `dqdl-agent` | Python · Flask · OpenAI SDK | 调 DeepSeek 生成地图/对话/叙事，管理 RAG 检索 |
| `rag/` | docx 文档库 | 世界设定知识源（魔兽/草药/丹药/魔核/经济/佣兵/场景） |
| `scripts/` | Python | 数据校验、迁移、修复、批量导入工具集 |

---

## 🎮 核心玩法

### 修炼与突破
- 玩家在**野外**（斗气浓郁度 > 0）地点修炼可累积修为，公式：`gained = qi_density × factor × technique.growth / 100`（10% 概率暴击 ×3）
- 修为满后可**突破**：成功率随境界下降（斗之气 80% / 斗者 70% / 斗师 60%），失败修为减半
- 等阶：`斗之气1-9段 → 斗者1-9星 → 斗师1-9星 → 大斗师1-9星`

### 历练战斗
- 仅野外（`wild/wild2/wild3`）可触发，根据地点 `common_mobs` 随机遭遇魔兽
- 胜率按双方总属性比（力量+智力+敏捷+体质）分档：随手斩杀/轻松获胜/势均力敌/艰难苦战/九死一生/毫无胜算
- 胜利后按魔兽 `drops` 配置随机掉落物品，并自动推进相关**佣兵任务**进度

### AI 生成的世界
- 地图节点首次访问时由 `dqdl-server` 调 `dqdl-agent` 生成，依据 `location_gen_rule` 表中的 prompt 模板
- 野外地点的 `common_mobs` 从 RAG 中按"等阶+栖息地"语义检索真实魔兽填充
- NPC 首次进入地点时按 `npc_role.required_in_loc_type` 规则生成（坊市管理员、佣兵公会接待员等）

---

## 📁 目录结构

```
dqdl/
├── dqdl-agent/              # Python AI 服务
│   ├── app.py               # Flask 入口，4 个生成接口
│   ├── rag_service.py       # 向量库索引与检索
│   └── vector_data/         # 切分后的 chunks + 向量（已 gitignore）
├── dqdl-server/             # NestJS 后端
│   └── src/
│       ├── player/ location/ npc/ mob/ item/
│       ├── backpack/ task/ technique/ skill/
│       └── location/map-generator.service.ts  # 地图生成调度
├── dqdl-web/                # Vue 3 前端
│   └── src/
│       ├── App.vue          # 主界面（地图/对话/背包/任务/斗技）
│       ├── stores/          # Pinia 状态（player/map/dialog/...）
│       └── api/             # axios 封装
├── rag/                     # 世界设定 docx 知识库
├── scripts/                 # 数据维护脚本（50+）
├── generate_world.py        # 世界观文档批量生成器
├── generate_scenes.py       # 基础场景设定生成器
└── .env                     # 根级环境变量（DeepSeek key 等）
```

---

## 🚀 快速开始

### 环境要求
- Node.js ≥ 18
- Python ≥ 3.10
- MySQL ≥ 8
- 可用的 [DeepSeek API Key](https://platform.deepseek.com/)

### 1. 配置环境变量

根目录 `.env`（dqdl-agent 读取）：
```ini
apikey=sk-你的deepseek密钥
base_url=https://api.deepseek.com
AGENT_PORT=5000
AGENT_HOST=0.0.0.0
```

`dqdl-server/.env`：
```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的数据库密码
DB_DATABASE=dqdl
APP_PORT=3000
AGENT_URL=http://localhost:5000
```

### 2. 初始化数据

```powershell
# 建库
mysql -u root -p -e "CREATE DATABASE dqdl CHARACTER SET utf8mb4;"

# 安装后端依赖 + 启动（TypeORM synchronize:true 会自动建表）
cd dqdl-server
npm install
npx ts-node src/location/seed.ts     # 写入固定节点 + 生成规则

# 安装 Agent 依赖
cd ../dqdl-agent
pip install flask openai python-dotenv pymysql
pip install sentence-transformers numpy python-docx

# 构建 RAG 索引（首次约 1-2 分钟，下载模型后很快）
python rag_service.py index

# 可选：批量生成世界设定文档（如需扩展 rag/ 目录）
# python ../generate_world.py
```

### 3. 启动

**方式一：一键启动（推荐）**

在项目根目录右键 `start.ps1` →「使用 PowerShell 运行」，会自动打开三个窗口分别启动 Agent / Server / Web。

**方式二：手动启动**

三个终端分别执行：

```powershell
# 终端 1：AI Agent
cd dqdl-agent
python app.py                       # http://localhost:5000

# 终端 2：后端 API
cd dqdl-server
npm run start:dev                   # http://localhost:3000

# 终端 3：前端（首次需先 npm install）
cd dqdl-web
npm install
npm run dev                         # http://localhost:5173
```

打开 http://localhost:5173 即可游玩。首次进入点击「新游戏」，系统会自动生成地图树并创建角色。

---

## 🔌 主要 API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/location/roots` | 根节点（斗气大陆） |
| GET | `/location/:id/children` | 子节点（自动触发生成） |
| POST | `/location/training` | 历练事件 |
| POST | `/player` | 创建玩家 |
| POST | `/player/:id/cultivate` | 修炼 |
| POST | `/player/:id/breakthrough` | 突破 |
| GET | `/npc/location/:locationId` | 地点 NPC（首次自动生成） |
| POST | `/npc/:id/talk` | NPC 对话 |
| GET | `/task/player/:playerId` | 玩家任务列表 |
| — | `agent /generate/map` | 地图子节点生成 |
| — | `agent /generate/dialog` | NPC 对话生成 |
| — | `agent /generate/training` | 历练叙事 |
| — | `agent /generate/breakthrough` | 突破叙事 |
| — | `agent /rag/search` | RAG 语义检索 |

---

## 🗺️ 地图层级与生成规则

| Depth | 类型 | 说明 |
| --- | --- | --- |
| 0 | continent | 斗气大陆（固定根节点） |
| 1 | region | 西北区域 / 中州 / 黑角域 / 隐秘空间界（固定） |
| 2 | empire | 帝国/大型势力（AI 生成） |
| 3 | mixed | 城市/野外/宗派/秘境（AI 生成，empire 下会递归展开整棵子树） |
| 4 | district / wild2 | 城内功能区 或 野外深处 |
| 5 | scene / wild3 | 具体场景 / 野外核心（最深） |

野外三档危险度：1=一阶魔兽区，2=二阶魔兽区，3=三阶魔兽区，斗气浓郁度公式：`random(1.4,1.5)^danger_level × 100`。

---

## 🧠 RAG 知识库

`rag/` 目录下的 docx 文档会被 `dqdl-agent/rag_service.py` 切分（图鉴类按 `【ID】` 切条目，其他按章节）→ 用 `paraphrase-multilingual-MiniLM-L12-v2` 编码 → 存为本地 `vectors.npy` + `chunks.json`。

当前知识库包含：魔兽图鉴（1-3 阶共 300 种）、草药图鉴、丹药图鉴、魔核体系/图鉴、材料图鉴、经济体系、佣兵体系、基础场景设定、世界观核心设定。

---

## 🛠️ 数据维护脚本（`scripts/`）

包含 50+ 个 Python 脚本，按用途分类：
- **校验类**：`check_*.py`（mob/item/drop/dialog 等数据完整性检查）
- **修复类**：`fix_*.py`（修正命名、品阶、掉落等）
- **迁移类**：`migrate_*.py`、`import_wb_full.py`、`populate_mob_level.py`
- **解析类**：`parse_wb_all.py`、`analyze_docx*.py`、`extract_mob_rank.py`
- **生成类**：`gen_material_desc.py`、`build_material_docx.py`、`seed_skill.py`

运行前请先确认数据库连接信息（部分脚本硬编码了连接参数，使用前需替换）。

---

## ⚠️ 注意事项

- `.env` 与 `dqdl-agent/vector_data/` 已被 `.gitignore` 忽略，请勿提交密钥与模型缓存
- TypeORM 启用了 `synchronize: true`，**生产环境请关闭**以防数据丢失
- HuggingFace 模型在 Agent 启动时强制离线模式（`TRANSFORMERS_OFFLINE=1`），首次构建索引需联网下载，之后离线可用
- 前端通过 Vite 代理 `/api → http://localhost:3000`，部署时需自行配置反向代理

---

## 📜 License

个人学习/作品展示用途，世界观版权归《斗破苍穹》原作者所有。
