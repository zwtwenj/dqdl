# dqdl-admin-web — 斗气大陆游戏管理平台前端

管理平台前端（Vue 3 + Vite）。提供 agent 调用日志可视化、数据库只读浏览、故事事件管理（触发配置 + 连线任务/奖励配置，含 X6 流程图画布）等管理页面。配套后端为 [`dqdl-admin`](../dqdl_admin/)。

## 技术栈

- Vue 3（`<script setup>`）+ Vite 5
- Element Plus（表单/弹窗/消息）
- Pinia（登录态）
- Vue Router（hash 路由 + 登录守卫）
- ECharts（Agent 日志图表）
- AntV X6 2.x（事件流程图：节点连线 + 滚轮缩放 + 拖动画布）
- axios（`/api` 代理到管理后端）

## 目录结构

```
dqdl_admin_web/
├── index.html
├── vite.config.js            # 端口 5174，/api 代理到 :4000
└── src/
    ├── main.js
    ├── App.vue
    ├── api/                  # 接口封装（request 统一注入 token）
    │   ├── auth.js           # 登录
    │   ├── agentLog.js       # agent 日志/对话
    │   ├── db.js             # 数据库浏览
    │   └── eventManage.js    # 事件管理
    ├── components/
    │   ├── EventTriggers.vue # 触发条件配置（事件/参数/概率）
    │   └── TaskConfig.vue    # 连线任务配置（目标 + money/item 奖励）
    ├── layouts/AdminLayout.vue
    ├── router/index.js       # 路由 + 登录守卫
    ├── stores/auth.js        # Pinia 登录态
    └── views/
        ├── Login.vue
        ├── Dashboard.vue     # Agent 日志总览（趋势图 + 汇总）
        ├── AgentLog.vue      # 调用明细列表
        ├── AgentDialog.vue   # 对话明细
        ├── DbViewer.vue      # 数据库只读浏览（表/列/分页数据）
        ├── EventManage.vue   # 事件列表
        └── EventDetail.vue   # 事件详情：X6 流程图画布 + 节点/连线配置
```

## 环境要求

- Node.js 18+
- 管理后端 `dqdl_admin` 已启动（:4000）

## 安装与启动

```bash
# 1. 安装依赖
npm install

# 2. 开发模式（默认 http://localhost:5174）
npm run dev

# 3. 生产构建
npm run build        # 产物在 dist/
npm run preview      # 本地预览构建产物
```

> 开发模式下 `/api` 由 Vite 代理到 `http://localhost:4000`（管理后端）；生产部署时需由 Web 服务器把 `/api` 反向代理到管理后端。

## 页面说明

| 路由 | 页面 | 功能 |
|---|---|---|
| `/login` | 登录 | 管理员登录（默认 admin/123456） |
| `/dashboard` | Agent 日志总览 | 调用量/成功率趋势图 + 汇总卡片 |
| `/agent-log` | 调用明细 | 逐条 agent 调用记录 |
| `/agent-dialog` | 对话明细 | 生成内容的对话记录 |
| `/db` | 数据库浏览 | 选表 → 看结构 → 分页浏览数据（只读） |
| `/events` | 事件管理 | 故事事件列表 + 「生成事件」按钮 |
| `/events/:id` | 事件详情 | X6 画布编辑事件流程，配置节点/连线 |

## 事件详情页功能

- **流程图**：X6 渲染事件 nodes，滚轮缩放、拖动画布，点击节点/连线进入配置。
- **节点配置**：查看/编辑节点文本与类型。
- **连线配置**（`connect_configs["n1->n2"]`）：
  - 支持 `publish_task`（发布任务）—— 配任务标题/描述/目标（前往某地等）/奖励。
  - 奖励支持 `money`（金币数量）与 `item`（手输 item 表全局唯一 ID + 数量，保存时后端校验存在性并自动回填物品名）。
  - 未配置完整的空目标/空奖励项在保存时自动过滤。
- **触发配置**（`trigger_config`）：选择触发钩子（如 `enter_map`）、配置玩家/地图参数条件与触发概率。

## 环境变量 / 端口

- 开发端口：`5174`（`vite.config.js` 中配置）。
- 后端代理目标：`http://localhost:4000`（管理后端，可在 `vite.config.js` 修改）。

## 注意事项

- 路由为 hash 模式（`createWebHashHistory`），刷新不 404。
- 所有接口请求经 `api/request.js` 自动附带 `Authorization: Bearer <token>`；token 存 Pinia（localStorage 持久化）。
- 登录态失效（401）时路由守卫会自动跳转登录页。
