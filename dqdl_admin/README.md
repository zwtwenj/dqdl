# dqdl-admin — 斗气大陆游戏管理平台后端

管理平台后端（NestJS + TypeORM）。提供 agent 调用日志可视化、数据库只读浏览、故事事件配置（触发 + 连线任务/奖励）等管理能力。与游戏后端 `dqdl_server1.0` 完全隔离：独立进程、独立端口、独立 JWT secret、独立管理员账号表。

## 技术栈

- NestJS 11 + TypeORM（MySQL）
- JWT + Passport 独立鉴权（token 与游戏后端互不互通）
- 业务表通过 DataSource 原生 SQL 只读访问（绝不 synchronize，避免误改结构）
- 仅注册自己的 `admin_users` 表

## 目录结构

```
dqdl_admin/
├── migrations/
│   └── admin_users.sql        # 管理员账号表建表脚本（幂等）
├── src/
│   ├── main.ts                # 入口：全局前缀 /api，端口 ADMIN_PORT(默认4000)
│   ├── app.module.ts          # 根模块：Config + TypeORM + 各业务模块
│   ├── auth/                  # 登录鉴权（admin_users 表 + JWT）
│   ├── agent-log/             # agent 调用日志 / 对话明细查询
│   ├── db-viewer/             # 数据库只读浏览（表/列/分页数据）
│   └── event-management/      # 故事事件管理（列表/详情/触发配置/连线配置/生成）
```

## 环境要求

- Node.js 18+
- MySQL 5.7+（与游戏后端共用 `dqdl1.0` 库）
- （可选）`dqdl-agent`（Flask，:5000）—— 仅「生成事件」功能需要

## 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 建管理员表（幂等，可重复执行）
mysql -u root -p dqdl1.0 < migrations/admin_users.sql

# 3. 配置环境变量（复制 .env 并按需修改）
#    .env 已随仓库提供，关键项见下方说明

# 4. 启动
npm run start:dev     # 开发模式（热重载）
# 或
npm run build && npm run start:prod   # 生产模式（node dist/main）
```

默认启动地址：`http://localhost:4000/api`，默认账号 `admin / 123456`（首次启动幂等创建）。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_DATABASE` | — | MySQL 连接（与游戏后端共用 dqdl1.0 库） |
| `ADMIN_PORT` | `4000` | 管理后端端口（区别于游戏后端 3000） |
| `JWT_SECRET` | 内置默认值 | 独立 JWT secret，生产务必修改 |
| `ADMIN_DEFAULT_USERNAME` / `ADMIN_DEFAULT_PASSWORD` | `admin` / `123456` | 默认管理员账号（首次启动幂等创建） |
| `AGENT_URL` | `http://127.0.0.1:5000` | dqdl-agent 地址（事件生成转发用） |

## API 一览

鉴权：除 `POST /api/auth/login` 外均需 `Authorization: Bearer <token>`。

### 认证
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 管理员登录，返回 `{ token, user }` |

### Agent 日志
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/agent-log/summary` | 调用汇总（总次数/成功率等） |
| GET | `/api/agent-log/trend` | 调用趋势（图表数据） |
| GET | `/api/agent-log/list` | 调用明细列表 |
| GET | `/api/agent-dialog/list` | 对话明细列表 |

### 数据库浏览（只读）
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/db/tables` | 所有表列表 |
| GET | `/api/db/tables/:table/columns` | 指定表的列结构 |
| GET | `/api/db/tables/:table/data` | 指定表的分页数据 |

### 事件管理
| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/events/list` | 事件列表 |
| GET | `/api/events/:id` | 事件详情（含 nodes / trigger_config / connect_configs JSON，供配置页回填） |
| POST | `/api/events/:id/trigger-config` | 保存触发配置 `{ trigger, params, probability }` |
| POST | `/api/events/:id/connect-config` | 保存连线配置 `{ edge: "n1->n2", config }`；`config=null` 删除。task.reward 的 item 奖励会校验 `item` 表存在性，不存在则保存失败，存在自动回填 `item_name` |
| POST | `/api/events/generate` | 生成新事件（转发 dqdl-agent `/generate/story-event`） |

## 设计要点

- **只读业务表**：TypeORM 的 entities 只注册 `AdminUser`，其余业务表全部经 `DataSource.query` 原生 SQL 访问；`synchronize: false`，绝不自动改业务表结构。
- **独立鉴权**：管理员账号表 `admin_users` 与游戏 `user` 表完全隔离，token 不互通。
- **奖励校验**：连线任务奖励支持 `money` / `item` 两种，item 奖励保存时校验 `item` 表存在性并自动回填物品名；未配置完整的空目标/空奖励项会被过滤。
