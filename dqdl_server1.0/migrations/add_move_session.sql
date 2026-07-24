-- ========== 移动系统：move_session 表 ==========
-- 玩家移动实例（速度/时间机制）。每次移动一行，记录起终点/距离/速度/时长/状态。
-- 配合 PLAYER_STATUS.MOVING=9（player 表无需改 schema，tinyint 容纳）。

CREATE TABLE IF NOT EXISTS `move_session` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '玩家ID',
  `from_net_id` INT NOT NULL COMMENT '起点 location_net.id',
  `to_net_id` INT NOT NULL COMMENT '终点 location_net.id',
  `from_name` VARCHAR(64) DEFAULT NULL COMMENT '起点名（快照）',
  `to_name` VARCHAR(64) DEFAULT NULL COMMENT '终点名（快照）',
  `distance` INT NOT NULL DEFAULT 70 COMMENT '距离(里)',
  `speed` INT NOT NULL COMMENT '速度(=玩家 quick 快照)',
  `duration_sec` INT NOT NULL COMMENT '总时长(秒) = ceil(distance*60/speed)',
  `start_at` DATETIME(6) NOT NULL COMMENT '开始时间',
  `end_at` DATETIME(6) NOT NULL COMMENT '结束时间 = start_at + duration_sec',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active=移动中; arrived=已到达; cancelled=已取消',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_move_player_status` (`player_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='移动实例表(玩家速度/时间移动)';
