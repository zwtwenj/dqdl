# 动态 NPC 演员池（dynamic_npc）

> 让 Agent/剧情系统像「选角导演」一样，从演员池里**取**演员，或现场**创建**演员并入库复用。
> 配套表：`dynamic_npc`（演员实例池）+ `npc_role`（职能/职业图鉴，已扩展 category 字段）。

## 一、为什么需要

DB 静态 NPC（`static_npc`）只覆盖固定职能（公会接待员/坊市管理员…），覆盖不到剧情里大量出场的「演员型」角色（散修/佣兵/赏金猎人/采药人…）。

`refine_script.py` 产出的剧本 `cast` 里 `is_dynamic=true` 的角色，以前没有可复用的池子承载——每次都要临时编、无法落库复用。

动态 NPC 演员池就是为这类角色准备的：**可启停、可移动、可复用、可在任意地点出现**。

## 二、数据模型

### 2.1 `npc_role`（扩展）
| 字段 | 说明 |
|---|---|
| name | 职能/职业名（UNIQUE） |
| **category** | `role`=静态职能 / `profession`=动态职业（新增） |
| **is_system** | 1=系统内置 / 0=Agent 运行时创建（新增） |
| prompt_hint | 喂 LLM 的身份描述 |
| required_in_loc_type | 必出现场景类型（仅静态职能用） |

内置 10 条 `role` + 7 条 `profession`（散修/佣兵/赏金猎人/采药人/魔修/遗迹寻宝者/落魄贵族）。

### 2.2 `dynamic_npc`（新表）
| 字段 | 说明 |
|---|---|
| name / gender / age / nature_id / role_id / description | 身份 |
| **enabled** | 启停开关：1=可出场 / 0=不出场 |
| **status** | 生命周期：alive / dead / left |
| **location_net_id** | 当前所在节点（可空） |
| **location_scene_id** | 当前所在场景（可空） |
| source / ref_type / ref_id | 来源追溯 |
| created_at / updated_at | 时间戳 |

**关键设计**：
- **location 两列皆空 = 游荡演员**，启用后可在任意地图/场景出现。
- **enabled 与 status 正交**：死掉的演员即便 enabled=1，也不会被 acquire/地点查询命中。
- **默认不绑 dialog_session/shop/task**（本轮边界）；如需让动态 NPC 开店/对话，下轮扩展。

## 三、Agent 接入点

### 3.1 选角（核心）—— `POST /api/npc/actor/acquire`

**查找或创建**一个动态演员，Agent/剧情选角的单入口。

```jsonc
// Request
{
  "role_name": "散修",          // 必填：职业/职能名（不存在会自动创建该职业）
  "nature": "冷淡",             // 可选：指定性格
  "loc_net_id": 12,             // 可选：希望出现的节点 id
  "loc_scene_id": 5,            // 可选：希望出现的场景 id
  "scene_name": "乌坦城坊市",   // 可选：喂 agent 增加贴合度
  "scene_type": "market",
  "city_name": "乌坦城",
  "ref_type": "encounter",      // 可选：来源追溯
  "ref_id": 88,
  "prefer_existing": true,      // 默认 true：优先复用池中已启用演员
  "description": "独行的中年散修" // 可选
}

// Response
{
  "id": 3, "name": "林寒", "gender": "男", "age": "中年",
  "nature_id": 4, "nature_name": "冷淡",
  "role_id": 11, "role_name": "散修", "role_hint": "...",
  "description": "...",
  "location_net_id": 12, "location_scene_id": null,
  "enabled": 1, "status": "alive",
  "is_new": true                // true=本次新建；false=复用池中已有
}
```

**算法**：
1. `ensureRole(role_name)` → 拿到 role_id（不存在则建 `category='profession'`）
2. `prefer_existing=true` 时：按 `role+enabled=1+status='alive'` + 位置匹配(或游荡) 命中一条即复用
3. 未命中 → **限额校验**：该 role 下 dynamic_npc 数量 ≥ **20** 则抛 `conflict`
4. 调 `agent.generateNpc` 生成设定 → 兜底随机 → 入库

### 3.2 创建职业 —— `POST /api/npc/role`
```jsonc
{ "name": "游侠", "prompt_hint": "四处游历的侠客，行侠仗义，言辞洒脱" }
```
赋予 Agent 造职业能力；`npc_role.name` UNIQUE 兜底去重。

### 3.3 管理 —— `/api/npc/dynamic/...`
| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/npc/dynamic` | 列表（分页+过滤 role_id/enabled/status/net_id/scene_id） |
| GET | `/api/npc/dynamic/:id` | 详情 |
| PATCH | `/api/npc/dynamic/:id` | 启停/移动/状态/描述 |
| DELETE | `/api/npc/dynamic/:id` | 删除（建议用 status=left 退役而非删除） |

### 3.4 地点可见查询 —— `GET /api/npc/location/:id?type=node|scene`
后端**已整合**，一次返回两组，前端无需查两次：
```jsonc
{
  "static": [ /* 绑该地点的静态 NPC */ ],
  "dynamic": [ /* 启用+存活的动态演员，位置匹配 或 游荡者 */ ]
}
```

## 四、与现有体系的关系

| 体系 | 关系 |
|---|---|
| `static_npc` | **零改动**，dialog_session/shop/task 的 npc_id 仍指向它 |
| Agent `/generate/npc` | **复用**，acquire 内部调它生成设定 |
| `refine_script.py` 的 `cast[].is_dynamic=true` | 运行时应走 `POST /npc/actor/acquire` 落地（脚本本身本轮不改） |
| Agent Python 侧 | **不连库**，通过 server acquire 间接管理池子 |

## 五、边界（本轮不做）
- 不接 encounter/dungeon 的演员落地（那是 refine_script→运行时编排的下一轮工作）
- 动态 NPC 不绑 dialog_session（无法对话）；如需对话，下轮让 createSession 支持（加 npc_type 判定）
- 不做演员自动移动/AI 演化（status/location 由 API 显式更新）

## 六、迁移与自测

```bash
# 1. 执行迁移（幂等，重复执行 ALTER 会报 Duplicate column，忽略即可）
mysql -u root -p dqdl1.0 < dqdl_server1.0/migrations/add_npc_role_category.sql
mysql -u root -p dqdl1.0 < dqdl_server1.0/migrations/add_dynamic_npc.sql

# 2. 自测见 scripts/test_dynamic_npc.sh
```
