# 地图系统重构：树状 → 网状（平面图 + 无限拓展）

> 状态：**设计阶段，待评审**
> 创建时间：2026-07-12

---

## 一、背景与问题

### 现状
当前地图用**树状邻接表**（`location.parent_id` + `depth` 0~5 固定层级
`大陆→区域→帝国→混合→城区→场景`）表达空间关系，懒生成入口 `POST /location/:id/expand`
按 `parent.depth+1` 查 `location_gen_rule` 调 DeepSeek 生成子节点。

### 根本问题
用「包含关系（containment）」近似「空间关系（spatial adjacency）」，二者本就正交：

| 问题 | 表现 |
|------|------|
| 父节点无地理意义 | `斗气大陆`/`中州` 这种容器节点是为套层级硬造的 |
| 只能上下移动 | 只有 `getChildren/getSiblings/返回上级`，无法表达"加玛帝国 与 出云帝国 相邻接壤" |
| 无距离概念 | `moveToLocation` 只校验目标存在，从大陆根跳到任意场景都是"一步" |
| 兄弟彼此无关 | 同层兄弟只共父，没有方位/距离，无法走横向路径 |
| 无法走环路 | 树没有环，现实 A→B→C→A 的环线是常态 |

### 目标（本设计的三条硬需求）
1. **有空间感** —— 空间感来自"连接关系 + 距离"，不依赖画图
2. **能拓展（无限地图）** —— 走到边缘往外延伸，可无限生长
3. **只要网状、不关心形状/边界** —— 纯图：节点 + 带权边，可成环、可多路径、可不规则

---

## 二、设计决策（已拍板）

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 拓展触发方式 | **显式出口桩** | 每个节点预先声明出口（含"未知方向"桩），玩家点了未知出口才触发生成。玩家能提前看到"边缘在哪"，空间感和悬念强；与现有 `expandNode` 模式最接近，改动顺滑 |
| 内部坐标 | **保留 `coord_x/coord_y`** | 不展示给玩家，只在后端用于：生成时防地理穿帮、校验距离合理、未来想做小地图可直接用。几乎零成本，收益大 |

**关键认知**：空间感 ≠ 要有地图画面。一个节点告诉玩家
"由此向东 300 里是乌坦城，向北是万里山脉（不可通行），向东南 80 里到青山镇"——
这就是空间感，哪怕没有任何图。

---

## 三、数据模型

### 3.1 `location` 表改造

新增字段，**保留** `parent_id` 但语义降级为"逻辑归属（可选）"，不再表达空间关系。

```sql
ALTER TABLE location
  ADD COLUMN coord_x     INT          DEFAULT NULL COMMENT '内部记账坐标（不展示）',
  ADD COLUMN coord_y     INT          DEFAULT NULL COMMENT '内部记账坐标（不展示）',
  ADD COLUMN is_frontier TINYINT      DEFAULT 0    COMMENT '1=前沿节点，外沿仍可继续向外拓展',
  ADD COLUMN zone_id     INT          DEFAULT NULL COMMENT '逻辑分组（如"加玛帝国版图"），不表示空间';
-- parent_id：保留为"逻辑归属"，可空；空间关系完全交给 location_edge
-- is_expanded：废弃，语义被 is_frontier + 边桩 status 取代（迁移期可并存）
```

字段语义说明：
- `coord_x/coord_y`：**纯内部记账**，基于来源节点 + 方向 + 距离推算，保证生成连贯、算距离。
  **永不展示给前端**。
- `is_frontier`：外沿节点标 1。玩家未探索其"未知出口"前它仍是 frontier。
  所有未知桩都被探索（变成 open）后，可由系统或玩家行为降为 0。
- `zone_id`：替代旧的层级归属语义，例如"这片都属于加玛帝国版图"，
  但 zone 之间是空间相邻还是分离，由 `location_edge` 决定。

### 3.2 新表 `location_edge`（核心：表达边）

```sql
CREATE TABLE location_edge (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  from_id       INT          NOT NULL COMMENT '起点地点 id',
  to_id         INT          DEFAULT NULL COMMENT '终点地点 id；NULL=未知出口桩',
  direction     VARCHAR(8)   DEFAULT NULL COMMENT 'N/NE/E/SE/S/SW/W/NW，纯文案用（"向东走"）',
  distance      INT          NOT NULL DEFAULT 1 COMMENT '路途距离/耗时（空间感来源）',
  travel_type   VARCHAR(16)  DEFAULT 'road' COMMENT 'road/wild/mountain/secret/portal',
  status        VARCHAR(16)  NOT NULL DEFAULT 'open'
                 COMMENT 'open=可直接通行；blocked=有屏障（山脉/禁区）；unknown=出口桩，目的地未生成',
  description   VARCHAR(255) DEFAULT NULL COMMENT '边描述（"穿过一片密林"）',
  created_at    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_from_dir (from_id, direction),
  INDEX idx_from (from_id),
  INDEX idx_to (to_id)
);
```

字段语义说明：
- `to_id = NULL` 即"**出口桩**"：知道"西边有路"，目的地尚未生成。这是无限拓展的钥匙。
- `status`：
  - `open` —— 正常边，`to_id` 必非空，玩家可直接走过去。
  - `blocked` —— 有屏障（"万里山脉挡住了去路"），不可通行，丰富世界观。
  - `unknown` —— 出口桩，`to_id` 可空；玩家点了触发 `expandFrontier`。
- `direction`：8 方位文案用，**不参与空间计算**（空间靠 `distance` + `coord`）。
  允许 `NULL`（适合没有明确方位的场景间通道，如"穿过传送阵"）。
- `distance`：单位"里"（或抽象的"路途耗时"）。是空间感的直接来源，
  可接历练/遭遇系统（路途远 → 中途触发事件）。
- 边的方向性：默认双向，但表里**存两条**（from↔to 各一条），便于按 from 查出口、
  也允许未来做单向边（瀑布顺流而下、单向传送）。
  生成时若需单向，只插一条。

### 3.3 旧表/字段的去留

| 对象 | 处理 |
|------|------|
| `location.parent_id` | 保留为逻辑归属（可空），**不再用于导航/查询关系** |
| `location.is_expanded` | 废弃，保留列不动（避免破坏存量数据），新代码不再读写 |
| `location.depth` | 保留为"逻辑层级"（用于文案/规则区分），不再驱动生成 |
| `location_gen_rule` | 改造：去掉 depth 驱动，改成按"区域类型/上下文"查规则（见 3.4） |
| `getChildren/getSiblings` | 废弃，被 `getExits(id)` 取代（见第五节） |

### 3.4 `location_gen_rule` 改造

现在规则按 `depth` 查（`continent→region→empire...` 各一层模板）。
网状模型没有固定层级，规则改为按**生成上下文**查：

```sql
-- 新增列（或新建一张 location_gen_rule_v2）
ALTER TABLE location_gen_rule
  ADD COLUMN context_key VARCHAR(32) NOT NULL DEFAULT 'default'
    COMMENT '生成上下文键：frontier_wild/frontier_city/inside_city/secret 等';
-- depth/min_children/max_children 改名/复用为 min_exits/max_exits
```

`context_key` 示例：
- `frontier_wild` —— 从野外节点往外拓展新野外（生成邻居 + 方位 + 距离）
- `frontier_city` —— 从城市往外拓展（可能遇到野外/邻城）
- `inside_city` —— 进入城市后生成内部功能区（坊市/公会/修炼室），可保留旧的 `ensure_city_districts`

服务端按"当前节点 loc_type + 是否 frontier + 玩家动作"决定查哪条规则。

---

## 四、无限拓展机制（核心）

### 4.1 出口桩（exit stub）工作流

每个 frontier 节点有一组"出口"，其中部分是 `status=unknown` 的桩：

```
当前节点：乌坦城 (is_frontier=1)
出口（location_edge where from_id = 乌坦城）：
  ├─ 东  → 帝都       (status=open,    to_id=123, distance=300)  ← 已知，可直接走
  ├─ 东南→ 青山镇    (status=open,    to_id=456, distance=80)
  ├─ 北  → 万里山脉  (status=blocked, to_id=NULL, distance=0)    ← 有屏障，过不去
  └─ 西  → ???        (status=unknown, to_id=NULL)               ← 桩：有路向西，目的地未生成
```

玩家点"向西" → 系统发现 `status=unknown` → 触发 `expandFrontier(乌坦城, '西')` →
AI 生成"迷雾森林"等一片新地点 + 它们之间的边 + 把新外沿标 frontier →
桩的 `to_id` 填上、`status` 改 `open` → 玩家走过去。

这就是"走到边缘延伸一圈"，而且更优：玩家到边缘前就能**看到**"西边有未知"。

### 4.2 拓展的几何生长（coord 怎么来）

新节点的 `coord` 由"来源节点 coord + 方向向量 × distance 缩放"推算，
保证地图连贯、防止穿帮：

```
方向向量（单位化）：
  E=(1,0)  W=(-1,0) N=(0,1)  S=(0,-1)
  NE=(0.707,0.707) ... 等

new_coord = source.coord + dir_vec * distance * SCALE
（SCALE 是常量，把"里"映射到内部坐标单位，例如 1里=0.1坐标单位）
```

生成时把"附近已有节点（按 coord 距离排序的 top-K）"连同它们的 coord 和名字
喂给 AI，让 AI：
1. 不要重复已有地名
2. 不要在地理上自相矛盾（A 既是 B 北边又紧贴 C）
3. 强制让 1~2 条新边**回连已有节点**（产生环/捷径，才是真"网状"）

### 4.3 防止"网状地图"变成一锅面条（三条约束）

纯图生成的最大坑是 AI 乱连。三条约束：

1. **坐标锚定**：新节点 coord 基于来源节点推算，避免 AI 把"加玛帝国"和"黑角域"塞到一起。
2. **回连预算**：每次生成 N 个新节点，强制让其中 1~2 条边连回已有节点，
   而不是全往外长成树——拿到网状的好处（多路径、可环路、真实世界感）又不失控。
3. **最小间距**：新节点 coord 与已有节点距离 < 阈值时，重生或改为回连，防止挤成一团。

### 4.4 拓展流程示意

```
第0步：初始只有一个 frontier 节点
            [帝都]F

第1步：玩家点帝都的"东-unknown"桩，触发生成
        [青山镇]F ─ [帝都] ─ [乌坦城]F
                      │
                   [大山]F
   （帝都的桩被填充为 open；乌坦城/青山镇/大山是 frontier）

第2步：玩家走到乌坦城，点"东-unknown"
   [青山镇]F ─ [帝都] ─ [乌坦城] ─ [迷雾林]F
                 │           │
              [大山]F    [碧水河]F
   （同时回连：乌坦城 ↔ 青山镇 捷径 → 成环）

无限继续……frontier 永远在外沿，地图无限生长
```

`F` = is_frontier=1。已彻底探索（所有桩都 open）的内部节点可降为非 frontier。

---

## 五、接口改动

### 5.1 服务端 `location.service.ts`

| 旧方法 | 新方法 / 改造 |
|--------|--------------|
| `getChildren(id)` | **废弃**，由 `getExits(id)` 取代 |
| `getSiblings(id)` | **废弃**（网状无兄弟概念，邻接由边表表达） |
| `expandNode(id)` | **改造为 `expandFrontier(id, direction?)`**：见 4.1~4.3 |
| `getRoot()` | 保留（玩家初始出生点的入口） |
| `findOne(id)` | 保留 |

新增方法：

```typescript
/** 查某地点的所有出口（含 open/blocked/unknown 桩），玩家"看地图"用 */
async getExits(locationId: number): Promise<LocationEdge[]>

/** 拓展前沿：把一个 unknown 桩变成一片新地点 + 边。
 *  direction 可选，指定从哪个方向的桩拓；不指定则任选一个 unknown 桩。
 *  返回：新生成的地点 + 填充后的边。 */
async expandFrontier(locationId: number, direction?: string): Promise<{
  newLocations: Location[],
  updatedEdges: LocationEdge[],
}>

/** 移动校验：from→to 是否有 open 边。
 *  若是 unknown 桩，返回需要先 expand 的提示。 */
async canTravel(fromId: number, toId: number): Promise<{
  ok: boolean,
  reason?: 'no_edge' | 'unknown_stub' | 'blocked',
  distance?: number,
}>
```

### 5.2 控制器 `location.controller.ts`

```typescript
@Get(':id/exits')          // 取代 :id/children + :id/siblings
exits(@Param('id', ParseIntPipe) id: number) {
  return this.locationService.getExits(id);
}

@Post(':id/expand')        // 保留路径，语义改为拓展前沿；可选 body { direction }
expand(@Param('id', ParseIntPipe) id: number, @Body() body?: { direction?: string }) {
  return this.locationService.expandFrontier(id, body?.direction);
}
```

`GET :id/exits` 返回示例（前端"出口列表"直接消费）：

```json
[
  { "id": 1, "direction": "东", "status": "open",    "to_id": 123, "to_name": "帝都",  "distance": 300, "travel_type": "road" },
  { "id": 2, "direction": "北", "status": "blocked", "to_id": null, "description": "万里山脉挡住了去路" },
  { "id": 3, "direction": "西", "status": "unknown", "to_id": null, "description": "一片迷雾，尚未探查" }
]
```

### 5.3 移动逻辑 `player.service.ts::moveToLocation`

现在只校验目标存在。改造为：

```typescript
async moveToLocation(playerId: number, toId: number): Promise<any> {
  const player = await this.repo.findOneBy({ id: playerId });
  if (!player) throw Biz.notFound(`玩家 ${playerId} 不存在`);

  // 1. 校验 from→to 是否有 open 边（玩家在 player.location_id，要去 toId）
  const check = await this.locationService.canTravel(player.location_id, toId);
  if (!check.ok) {
    if (check.reason === 'unknown_stub') throw Biz.conflict('该方向尚未探查，请先拓展');
    if (check.reason === 'blocked')      throw Biz.conflict('此路不通');
    throw Biz.conflict('两地之间没有通路');  // no_edge
  }

  // 2. 按 distance 扣时间/体力/触发路途遭遇（接历练系统，后续迭代）
  // await this.travelService.consumeTime(playerId, check.distance);

  player.location_id = toId;
  await this.repo.save(player);
  return this.findOne(playerId);
}
```

> 路途遭遇（按 distance 触发历练）是后续迭代，本期只把"距离"算出来、纳入移动校验。

---

## 六、AI 生成逻辑改造（dqdl-agent）

### 6.1 入口 `routes/map.py::/generate/map`

请求体从"生成 N 个子节点"改为"在指定上下文向外拓展"：

```python
# 请求体（新版）
{
  "source": {                    # 触发拓展的节点
    "id": 12, "name": "乌坦城", "loc_type": "city",
    "description": "...", "coord_x": 100, "coord_y": 200,
    "direction_hint": "西"        # 玩家点的方向桩
  },
  "context_key": "frontier_city", # 查哪条规则
  "nearby": [                     # 附近已有节点（按 coord 距离 top-K），供回连 & 防穿帮
    {"id": 7, "name": "帝都",  "loc_type": "city", "coord_x": 380, "coord_y": 200},
    {"id": 9, "name": "青山镇","loc_type": "town", "coord_x": 130, "coord_y": 120}
  ],
  "count": 3,                     # 本次生成几个新节点
  "existing_names": ["帝都","青山镇"]
}
```

### 6.2 响应（新版）

```json
{
  "new_locations": [
    { "name": "迷雾森林", "loc_type": "wild", "description": "...",
      "danger_level": 2, "coord_x": 60, "coord_y": 210,
      "common_mobs": [...], "tags": ["密林"] }
  ],
  "new_edges": [
    // 新节点之间、新节点与来源、新节点回连附近节点
    { "from": "乌坦城", "to": "迷雾森林", "direction": "西", "distance": 40, "travel_type": "wild" },
    { "from": "迷雾森林", "to": "青山镇", "direction": "东南", "distance": 90, "travel_type": "wild" }
  ]
}
```

坐标可由 AI 出，也可由后端按"来源 coord + 方向"算好直接赋给新节点（更稳，推荐后者）。

### 6.3 prompt 改造要点

- system prompt 不变（"斗气大陆世界观设计师，只输出 JSON"）。
- user prompt 增加"附近已有地点列表 + 它们的相对方位"，约束 AI：
  - 不重复地名
  - 新地点的位置要和来源方向一致（向西拓就在西边）
  - 至少 1 条边回连 nearby 里的已有节点
- RAG 检索魔兽逻辑（`_fetch_real_mobs`）**完全复用**，只是输入从"父节点"换成"来源节点"。
- `ensure_city_districts` 保留，仅在 `context_key=inside_city` 时调用。

---

## 七、前端改动

### 7.1 API 层 `api/location.js`

```js
// 取代 getChildren + getSiblings
export const getLocationExits = (id) => http.get(`/location/${id}/exits`)

// expand 增加可选 direction
export const expandLocation = (id, direction) =>
  http.post(`/location/${id}/expand`, { direction })
```

### 7.2 展示组件 `MapDrawer.vue` → `ExitsDrawer.vue`

当前的 `MapDrawer` 是横向卡片流，展示同级/子级地点。
网状模型下，"邻居"不再是"子级"，而是"出口指向的地点"。改造点：

- 标题栏语义：从"可达之所/邻近之地"统一为"**出口（连接的区域）**"。
- 卡片内容：每张卡 = 一个出口，额外显示**方位 + 距离**：
  ```
  [东] 帝都
   300里 · 官道
  ```
- **未知出口桩**也展示成卡片（雾化样式），点击触发 `expandLocation(id, '西')`：
  ```
  [西] ??? （迷雾，尚未探查）
       点击探查 →
  ```
- **屏障出口**展示为灰色不可点：`[北] 万里山脉（此路不通）`。

`MapDrawer` 的图标映射、危险度/斗气样式、动画全部复用，只改数据源和文案槽。

### 7.3 `GameView.vue` 联动

- 数据源仍是 `player.location_id`。
- `CurrentMap`（当前地点详情）不变。
- 两个 `MapDrawer`（邻近之地 + 可达之所）合并为**一个** `ExitsDrawer`，
  数据来自 `getLocationExits(currentLocationId)`。
- 点 open 出口 → `moveTo`；点 unknown 桩 → `expandLocation` → 刷新 exits。
- 去掉"返回上级"（`onMapBack` 用 `parent_id`）—— 网状没有"上级"，
  玩家想"回去"就点来时的那个反向 open 出口即可。

---

## 八、迁移与兼容

### 8.1 数据迁移（一次性）

存量树数据可平滑迁移为图：

1. 加列、建 `location_edge` 表（见 3.1、3.2）。
2. 把存量 `parent_id` 关系**双向**写入 `location_edge`：
   - `from = 子`，`to = 父`，`direction = NULL`（旧层级无方位概念），`distance = 1`，`status = open`。
   - 反向也写一条。
3. 给每个旧叶子节点（无子节点的）补 1~3 个 `status=unknown` 的出口桩，方向随机，
   使其成为 frontier（`is_frontier=1`），让玩家立刻能"往外探"。
4. 旧的根节点（斗气大陆）和固定区域（中州/黑角域等）：
   互相之间补 `location_edge`（按世界观设定方位距离），它们成为玩家出生后的初始出口。

### 8.2 代码兼容期（可选）

- `getChildren/getSiblings` 可保留 1~2 个版本作 deprecated，内部转调 `getExits` 并过滤，
  避免一次性删掉打乱前端联调节奏。
- `is_expanded` 字段不删，新代码不读写即可。

### 8.3 回滚

- 表结构改动都是 `ADD COLUMN` / `CREATE TABLE`，不删列不动存量数据，可安全回滚。
- 唯一不可逆的是"迁移脚本把 parent_id 翻译成了 edge"——但这只是新增 edge 行，
  不动 parent_id 本身，回滚删 edge 行即可。

---

## 九、实施分期建议

| 期 | 范围 | 产出 |
|----|------|------|
| **P0 模型落地** | 建表 + 加列 + 迁移脚本 + 实体类 | 数据模型就绪，旧数据无破坏 |
| **P1 核心读写** | `getExits` / `canTravel` / `expandFrontier` + 控制器接口 | 后端能跑通网状地图 |
| **P2 AI 生成** | dqdl-agent `/generate/map` 改为 frontier 模式 + coord 推算 + 回连约束 | 无限拓展可玩 |
| **P3 前端** | `ExitsDrawer` + 未知桩交互 + 去掉返回上级 | 玩家可见可用 |
| **P4 路途遭遇（可选）** | `moveToLocation` 按 distance 触发历练事件 | 空间感闭环（接 tempering 系统） |

P0~P3 是本设计的核心闭环，P4 依赖既有的历练随机事件系统（见 `tempering-dungeon-design.md`）。

---

## 十、风险与未决

| 项 | 说明 | 处理 |
|----|------|------|
| AI 回连质量不稳定 | 强制回连可能生成不合理的捷径 | 设回连预算（1~2 条），并在 prompt 里明确"仅当地理合理才回连" |
| coord 漂移 | 反复向外拓，coord 可能累积偏差 | coord 仅内部记账，不展示，偏差不影响玩法；必要时定期重整 |
| 旧"固定层级"叙事失效 | `斗气大陆→中州→黑角域` 这种容器节点失去意义 | 它们降为"标志性区域"节点，互相之间用 open edge 连通，仍可作出生点 |
| 生成成本 | 玩家频繁点未知桩 → 大量 AI 调用 | 复用现有 `agent_call_log` 限频；单次拓展一次调用生成多个节点摊薄成本 |
| `direction` 唯一约束 | `(from_id, direction)` 唯一可能限制同向多出口 | 允许 direction 为 NULL 绕过；或放宽数量上限由规则控制 |

---

## 参考

- 空间感与网状地图：MUD 房间图模型（"a graph of interconnected rooms"，MIT 6.005 Project 6）
- 出口桩（exit stub）概念：文字冒险/MUD 地图设计的通行做法（参考 Trizbort）
- 多边形/Voronoi 大地图（本方案未采用，留作未来"大陆级宏观地图"扩展）：
  Amit Patel《Polygonal Map Generation for Games》
