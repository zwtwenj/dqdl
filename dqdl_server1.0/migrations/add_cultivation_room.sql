-- 修炼室会话表（城内付费修炼）。
-- 幂等：可重复执行。复刻老版 dqdl-server/cultivation_room_session 表。
-- 玩家选档位后 SSE 流定时结算（扣金币+涨修为），金币不足/修满/停止时结束。
-- 本次只做 qi 模式（修炼角色修为），mode 字段预留 technique/skill 扩展。
CREATE TABLE IF NOT EXISTS `cultivation_room_session` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '玩家ID',
  `mode` VARCHAR(16) NOT NULL DEFAULT 'qi' COMMENT '修炼类型: qi/technique/skill',
  `tier` INT NOT NULL COMMENT '档位(1-3)，决定倍率与每跳金币',
  `rounds` INT NOT NULL DEFAULT 0 COMMENT '已结算轮次',
  `total_gained` INT NOT NULL DEFAULT 0 COMMENT '累计获得修为',
  `total_cost` INT NOT NULL DEFAULT 0 COMMENT '累计消耗金币',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态: active/stopped/finished',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_cult_room_player_status` (`player_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='修炼室会话表（城内付费修炼）';
