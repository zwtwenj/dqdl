/**
 * 游戏业务配置（集中管理）。
 *
 * 设计原则：
 *   - 业务规则/数值平衡/概率分布集中于此文件，带类型、走 git 版本管理。
 *   - 与项目现有 export const 风格一致，业务代码直接 import 使用。
 *   - 运维可调的环境参数（时长/间隔/容量等）由 .env 覆盖，service 用 ConfigService 读取，
 *     此处的值作为"默认值/文档"。
 *
 * 改这里的数值 = 改游戏规则，需 code review。
 */

// ============ 历练 ============
export const TRAINING = {
  /** 历练总时长（毫秒）。默认 60s；.env 的 TRAINING_MAX_DURATION 可覆盖（当前=180000=3分钟） */
  durationMs: 60_000,
  /** 日志生成间隔（毫秒）。.env 的 TRAINING_INTERVAL 可覆盖（当前=10000=10秒） */
  logIntervalMs: 10_000,
  /** 历练战斗胜率（0~1） */
  winRate: 0.7,
};

// ============ 奇遇 ============
export const ENCOUNTER = {
  /** 历练中触发奇遇的概率（0~1） */
  triggerRate: 0.1,
  /** 未进入（pending）奇遇的最大累计数，满后不再触发 */
  maxPending: 10,
  /** 奇遇分流：dungeon 占比（余下为 cultivate 洞天福地） */
  dungeonRatio: 0.5,
};

// ============ 统一修炼引擎 ============
// 洞天福地 + 修炼室 共用：effectiveQi = baseQi × starMult[tier]，结算走 PlayerService.cultivate。
// scene 区分：blessed(免费/按轮数结束) vs room(付费/按时长结束/支持离线补偿)。
export const BLESSSED_LAND = {
  /** 基础斗气浓郁度（再乘档位/星级倍率）。1档=150，2档=300，3档=600 */
  baseQi: 150,
  /** 档位/星级 → 修炼倍率（1=×1, 2=×2, 3=×4），两场景共用 */
  starMult: { 1: 1, 2: 2, 3: 4 } as Record<number, number>,
  /** 最大结算轮次（仅 blessed 用，到上限自动结束） */
  maxRounds: 10,
  /** 结算间隔（毫秒）。默认 10s（开发）；.env CULTIVATION_INTERVAL 可覆盖（正式建议更长） */
  intervalMs: 10_000,
};

// ============ 修炼室场景（room）配置 ============
// 仅 scene='room' 使用。时长可由玩家选择，金币按档位每轮扣。
export const CULTIVATION_ROOM = {
  /** 可选修炼时长（分钟），供前端渲染时长选项 */
  durations: [1, 2, 3, 4, 5, 6, 7, 8] as number[],
  /** 最短时长（分钟） */
  minDurationMin: 1,
  /** 最长时长（分钟） */
  maxDurationMin: 8,
  /** 档位 → 每轮金币消耗（原 service 内硬编码 TIER_COST 迁入此处） */
  costPerTier: { 1: 200, 2: 400, 3: 800 } as Record<number, number>,
  /** room 场景的 max_rounds 占位（实际按时长结束，这里给足够大的安全上限） */
  roomMaxRounds: 10_000,
};

// ============ 地图生成 ============
export const MAP = {
  /**
   * 地图节点 loc_type 分布（概率，非累积）。
   * rollLocType 按此分布掷骰。原硬编码 0.6/0.25/0.10/0.05（散落 location-net.service 两处，已合并）。
   */
  locTypeDist: {
    wild: 0.6,
    city: 0.25,
    sect: 0.1,
    secret: 0.05,
  } as Record<string, number>,
};

// ============ 佣兵任务 ============
// 所有项均可被 .env 同名前缀 TASK_ 覆盖（运行时可调、不打包）。
// 改 .env → 重启进程即生效，无需重新 build。见 task.service.ts 顶部读取逻辑。
export const TASK = {
  /** 单玩家进行中佣兵任务上限。.env: TASK_MAX_PENDING */
  maxPending: 3,
  /** 击杀数量下限。.env: TASK_KILL_MIN */
  killMin: 6,
  /** 击杀数量上限。.env: TASK_KILL_MAX */
  killMax: 10,
  /** 搜图范围内候选地图下限（不足则定向生成补齐）。.env: TASK_MIN_CANDIDATES */
  minCandidates: 3,
  /** 搜图范围：当前地点切比雪夫距离 N 格内。.env: TASK_MAX_DIST */
  maxDist: 3,
  /** 危险度(1/2/3阶) → 奖励金币基数。.env: TASK_REWARD_BASE（逗号分隔，如 3000,6000,10000） */
  rewardBase: { 1: 3000, 2: 6000, 3: 10000 } as Record<number, number>,
};

// ============ 容量上限 ============
export const CAPACITY = {
  /** 背包格数上限（原 BACKPACK_CAPACITY，shop.service 里硬编码 350 已合并到此） */
  backpack: 350,
  /** 每个账号最多角色数（原 MAX_CHARACTERS） */
  maxCharacters: 3,
};

// ============ 待抽取清单（本次未动，留桩便于后续）============
// 以下常量目前仍散落在各 service，本次重构未涉及（改动面大/需充分测试）。
// 后续可逐步迁入此文件：
//   - 战斗减伤公式：battle-engine.ts 的 800/20/100/0.95、暴击×2、crit_rate 20
//   - 玩家属性公式：max_hp = stamina*10、max_energy = level*20（散落 player.service 4处 + battle.service 1处）
//   - 成长数值：levelAttrBonus(9/1/3)、levelK{400/300/200/100}、breakthroughRate{80/70/60}
//   - 等阶映射：TIER_CONFIG、LOC_TYPE_TO_TIER、SKILL_GRADE_K、TECHNIQUE_RANK_K、ATTR_TO_CORE_PREFIX
//   - 命名池/文案：SCENE_POOL、NAME_POOL、SCENE_TITLES/DESCS、CULTIVATE_DESCS（宜单独 dictionaries/ 目录）
