-- ========== 动态NPC演员池（幂等） ==========
-- 依赖：nature、npc_role（add_npc.sql + add_npc_role_category.sql 已建/已扩展）
--
-- 设计目的：DB 静态 NPC（static_npc）只覆盖固定职能（接待员/管理员…），覆盖不到
--   剧情里大量出场的「演员型」角色（散修/佣兵/赏金猎人/采药人…）。
--   refine_script.py 产出的 cast[].is_dynamic=true 角色需要一个可复用、可启停、
--   可移动的演员池来承载：Agent/剧情需要演员时「查找或创建」（acquire）。
--
-- 与 static_npc 的区别：
--   - location_* 两列皆可空 → 空表示「游荡演员」，启用后可在任意地图/场景出现
--   - 有 enabled（启停开关）+ status（alive/dead/left 生命周期）两套独立状态
--   - 默认不绑 dialog_session/shop/task（避免改现有外键；后续按需扩展）
--
-- 复用规则（与 server DynamicNpcService.acquire 对齐）：
--   prefer_existing=true 时，按 role_id + enabled=1 + status='alive' 命中一条即复用。
--   每个 role_id 下 dynamic_npc 数量上限 20（acquire 内校验，防 Agent 无限造词）。

CREATE TABLE IF NOT EXISTS `dynamic_npc` (
  `id` INT NOT NULL AUTO_INCREMENT,
  -- 身份
  `name` VARCHAR(32) NOT NULL COMMENT '姓名',
  `gender` VARCHAR(4) NOT NULL DEFAULT '男' COMMENT '性别',
  `age` VARCHAR(16) NOT NULL DEFAULT '中年' COMMENT '年龄段：少年/青年/中年/老年',
  `nature_id` INT NOT NULL COMMENT '性格ID → nature.id',
  `role_id` INT NOT NULL COMMENT '职业/职能ID → npc_role.id（多为 category=profession 的动态职业）',
  `description` VARCHAR(500) DEFAULT NULL COMMENT '人物描述/背景一句话（可空）',
  -- 启用/状态（两者正交：enabled=开关，status=生命周期）
  `enabled` TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用(可在地图/场景出现); 0=停用(不出场)',
  `status` VARCHAR(16) NOT NULL DEFAULT 'alive' COMMENT 'alive=存活 / dead=死亡 / left=离场',
  -- 位置（可移动；两列皆空 = 游荡演员，启用后可在任意地点出现）
  `location_net_id` INT NULL COMMENT '当前所在地图节点 → location_net.id; 可空',
  `location_scene_id` INT NULL COMMENT '当前所在场景 → location_scene.id; 可空',
  -- 来源追溯
  `source` VARCHAR(16) NOT NULL DEFAULT 'agent' COMMENT 'agent=Agent生成; manual=人工; script=剧本落地',
  `ref_type` VARCHAR(32) NULL COMMENT '来源类型如 encounter/dungeon/script',
  `ref_id` INT NULL COMMENT '来源记录ID',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_dyn_role` (`role_id`),
  KEY `idx_dyn_enabled_status` (`enabled`, `status`),
  KEY `idx_dyn_net` (`location_net_id`),
  KEY `idx_dyn_scene` (`location_scene_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='动态NPC演员池（可启停·可移动·可复用）';
