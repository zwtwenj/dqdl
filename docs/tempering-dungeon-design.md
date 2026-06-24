# 历练随机事件 & 单人副本系统（设计稿）

> 状态：**设想阶段，未实现**
> 创建时间：2026-06-21

---

## 一、触发机制

- 历练（SSE 流）中有概率触发随机事件
- 由 agent 生成事件场景和叙事文案
- 示例：「在一片摸索中，你发现了一个隐秘的山洞。」
- 玩家可选择 **进入** 或 **忽略**

---

## 二、副本系统（tempering_map）

### 风格参考
- **杀戮尖塔**（Slay the Spire）—— 节点路径、多幕推进
- **地下城堡**（Dungeon Castle）—— 资源管理、debuff 机制

### 副本结构
```
入口
 ├─ 第1幕（战斗 / 事件 / 休息）
 ├─ 第2幕（战斗 / 事件 / 宝箱）
 ├─ ...
 ├─ 第N幕（BOSS层）
 │    └─ 区域BOSS（属性更高）
 └─ 宝箱 → 结算 → 退出
```

### 节点类型

| 类型 | 说明 |
|------|------|
| `battle` | 遭遇怪物，使用副本内独立战斗体系 |
| `event` | 文字事件，多选一（绕过/战斗/探索） |
| `rest` | 恢复部分HP/斗气 |
| `treasure` | 获得物品/buff |
| `boss` | 最终挑战，属性更高 |

---

## 三、副本内战斗体系（区别于野外历练）

### 与野外战斗的差异

| 维度 | 野外战斗 | 副本内战斗 |
|------|----------|------------|
| HP 来源 | player.hp（持久化） | 副本内独立 HP（临时） |
| 死亡惩罚 | 无（仅记录） | 自动退出副本 |
| debuff | 无 | 有（流血/中毒/虚弱等） |
| 恢复 | 无 | 休息节点/事件恢复 |
| 斗技 | 当前装备 | 玩家自选使用 |
| 掉落 | 直接进背包 | 结算时统一发放 |

### 战斗规则
- 玩家自选斗技使用
- 受到 debuff 影响（如攻击力下降、持续掉血）
- 血量归零 → 自动退出副本（失败结算）
- 击败怪物 → 不直接掉落，结算时统一计算

---

## 四、数据表设计（草案）

### `tempering_map` — 副本模板表

```sql
CREATE TABLE tempering_map (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  name          VARCHAR(64)    NOT NULL COMMENT '副本名（隐秘山洞）',
  description   TEXT           NULL     COMMENT '描述',
  difficulty    TINYINT        DEFAULT 1 COMMENT '难度（关联 danger_level）',
  total_floors  INT            DEFAULT 5 COMMENT '总层数',
  boss_mob_id   VARCHAR(16)    NULL     COMMENT 'BOSS 怪物ID',
  reward_pool   TEXT           NULL     COMMENT '奖励池JSON',
  trigger_event VARCHAR(256)   NULL     COMMENT '触发事件文案',
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);
```

### `tempering_instance` — 副本实例表

```sql
CREATE TABLE tempering_instance (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  player_id     INT            NOT NULL,
  map_id        INT            NOT NULL COMMENT '关联 tempering_map',
  current_floor INT            DEFAULT 1 COMMENT '当前层',
  player_hp     INT            DEFAULT 0 COMMENT '副本内独立HP',
  player_energy INT            DEFAULT 0 COMMENT '副本内独立斗气',
  debuffs       TEXT           NULL     COMMENT 'JSON debuff列表',
  status        VARCHAR(16)    DEFAULT 'active' COMMENT 'active/completed/failed',
  seed          VARCHAR(32)    NULL     COMMENT '随机种子（可复现）',
  path          TEXT           NULL     COMMENT '已走路径JSON',
  created_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 五、技术实现路径

### 1. Agent 扩展
- 扩展 `/generate/training` 返回值，新增 `event_type` 字段
  - `normal`：普通历练事件（现有）
  - `dungeon`：触发副本（携带副本模板信息）
- 新增 `/generate/dungeon-event` 生成副本内每幕的事件文案

### 2. 后端新增模块 `TemperingModule`
```
tempering/
  ├── tempering.module.ts
  ├── tempering.controller.ts   # 进入/退出副本、推进层、结算
  ├── tempering.service.ts      # 副本逻辑、战斗、奖励计算
  ├── tempering-map.entity.ts   # 副本模板
  ├── tempering-instance.entity.ts  # 副本实例
  └── dto/
```

**API 端点（规划）：**

| Method | Path | 说明 |
|--------|------|------|
| POST | `/tempering/enter` | 进入副本（传 mapId） |
| GET | `/tempering/current` | 获取当前副本状态 |
| POST | `/tempering/next` | 推进到下一层 |
| POST | `/tempering/battle` | 副本内战斗（一轮） |
| POST | `/tempering/rest` | 休息节点恢复 |
| POST | `/tempering/exit` | 退出副本并结算 |

### 3. 前端
- 新增 `stores/tempering.js`（Pinia store）
- 副本界面为全屏遮罩（遮盖主地图，类似战斗弹窗）
- 节点选择界面（杀戮尖塔式路径图）
- 副本内独立战斗 UI（复用现有战斗组件，但数据源切换为副本实例）

---

## 六、流程示例

```
1. 历练触发 → agent 返回 event_type: 'dungeon'
   "在一片摸索中，你发现了一个隐秘的山洞。"
   [进入山洞]  [忽略]

2. 玩家点击进入 → POST /tempering/enter
   → 创建 tempering_instance（HP=满血, energy=满斗气）
   → 返回第1幕节点选择

3. 第1幕 → 显示2-3个可选节点
   ⚔️ 战斗：鬣狗      [战斗] [绕过]
   📦 事件：古老石碑   [探索] [离开]

4. 玩家选择战斗 → POST /tempering/battle
   → 独立战斗体系（带debuff）
   → 胜利后进入下一幕

5. ... 重复至 BOSS 层 ...

6. BOSS 战 → 属性更高，击败后开宝箱

7. 结算 → 发放奖励 → 退出副本 → 回到历练界面
```

---

## 七、开放问题（待定）

- [ ] 副本触发概率如何配置？（建议环境变量 `DUNGEON_TRIGGER_RATE`）
- [ ] 副本内 debuff 的具体种类和效果
- [ ] BOSS 怪物数据来源（agent 生成 / 手工配置 / 普通怪增强版）
- [ ] 副本失败是否有惩罚（如扣除修为）
- [ ] 副本冷却时间（同地点多久触发一次）
- [ ] 是否支持中途退出（保留进度）
