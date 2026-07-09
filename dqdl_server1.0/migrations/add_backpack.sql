-- 仅新增 backpack 表（幂等，不影响其它表）
-- 一个玩家一个物品一行，count 记录数量，count 归零后删除该行。
-- (player_id, item_id) 唯一，保证合并写入用 ON DUPLICATE KEY UPDATE。
CREATE TABLE IF NOT EXISTS `backpack` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '所属玩家ID',
  `item_id` VARCHAR(32) NOT NULL COMMENT '物品ID（与 item 表 item_id 对齐）',
  `count` INT NOT NULL DEFAULT 1 COMMENT '持有数量（0 时删除该行）',
  `acquired_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '首次获得时间',
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_backpack_player_item` (`player_id`, `item_id`),
  KEY `idx_backpack_player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='背包表';
