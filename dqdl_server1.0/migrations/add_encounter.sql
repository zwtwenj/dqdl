-- 奇遇表（历练中发现副本入口/洞天福地）。
-- 幂等：可重复执行。复刻老版 dqdl-server 的 encounter 表。
-- 本次范围：仅"发现入口"（status=pending 入列表），点"进入"后的副本/洞天玩法留后续。
CREATE TABLE IF NOT EXISTS `encounter` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '玩家ID',
  `kind` VARCHAR(32) NOT NULL DEFAULT 'dungeon' COMMENT '奇遇类型: dungeon(秘境入口)/cultivate(洞天福地)',
  `scene_type` VARCHAR(32) NOT NULL DEFAULT '' COMMENT '场景类型(山洞/密林/山谷/浅滩)，cultivate为空',
  `star` INT DEFAULT NULL COMMENT '星级(仅cultivate奇遇,1-3，决定修炼倍率)',
  `title` VARCHAR(64) NOT NULL COMMENT '奇遇标题',
  `description` VARCHAR(256) NOT NULL COMMENT '触发描述',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT '状态: pending/entered/done/abandoned',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_encounter_player_status` (`player_id`, `status`),
  KEY `idx_encounter_player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='奇遇表（历练中发现副本入口/洞天福地）';
