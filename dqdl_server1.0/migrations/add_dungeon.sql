-- 秘境实例表（玩家进入的 AI 生成五幕副本）。
-- 幂等：可重复执行。复刻老版 dqdl-server/dungeon_instance 表。
-- 五幕进度全部塞在 acts JSON 列里，current_act 是游标，状态机 active→completed/escaped/failed。
-- 本次第一期：只做编排闭环（生成/进入/推进/撤退/恢复），战斗/临时背包结算留后续（temp_items 列先建好）。
CREATE TABLE IF NOT EXISTS `dungeon_instance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '玩家ID',
  `scene_type` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '场景类型(山洞/密林/山谷/浅滩)',
  `difficulty` INT NOT NULL DEFAULT 1 COMMENT '难度星级 1-3（决定魔兽/魔核等阶）',
  `title` VARCHAR(64) NOT NULL COMMENT '副本名称',
  `intro` TEXT DEFAULT NULL COMMENT '入口引导叙事',
  `acts` JSON NOT NULL COMMENT '五幕蓝图JSON数组，含enrich后的mob/reward/运行时状态',
  `current_act` INT NOT NULL DEFAULT 1 COMMENT '当前幕游标 1-5',
  `encounter_id` INT DEFAULT NULL COMMENT '来源奇遇ID（结束时回写奇遇状态）',
  `temp_items` TEXT DEFAULT NULL COMMENT '临时背包JSON[{name,count}]，本次不用，留后续（应用层写入时保证[]）',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态: active/completed/escaped/failed',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_dungeon_player_status` (`player_id`, `status`),
  KEY `idx_dungeon_player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秘境实例表（玩家进入的AI生成五幕副本）';
