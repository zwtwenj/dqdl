-- 洞天福地修炼会话表。
-- 幂等：可重复执行。复刻老版 dqdl-server/cultivation_session 表。
-- 玩家进入一个 kind='cultivate' 奇遇后创建一行，SSE 流定时结算（每轮增加修为），
-- rounds 达 max_rounds 自动 finished；玩家可主动 stopped。
CREATE TABLE IF NOT EXISTS `cultivation_session` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '玩家ID',
  `encounter_id` INT DEFAULT NULL COMMENT '来源奇遇ID（结束时回写奇遇状态）',
  `star` INT NOT NULL COMMENT '星级(1-3)，决定修炼倍率(×1/×2/×4)',
  `rounds` INT NOT NULL DEFAULT 0 COMMENT '已结算轮次',
  `max_rounds` INT NOT NULL DEFAULT 10 COMMENT '最大轮次',
  `total_gained` INT NOT NULL DEFAULT 0 COMMENT '累计获得修为',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态: active/stopped/finished',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_cultivation_player_status` (`player_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='洞天福地修炼会话表';
