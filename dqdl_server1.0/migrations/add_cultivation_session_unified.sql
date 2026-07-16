-- 统一修炼会话表（合并洞天福地 + 修炼室）。
-- 幂等：可重复执行。开发环境，修炼会话是临时数据，可丢弃后重建。
--
-- 用 scene 字段区分两类场景，共用同一套收益公式：
--   blessed=洞天福地（奇遇驱动、免费、按 max_rounds 结束）
--   room=修炼室（付费、按 planned_seconds 时长结束、支持离线补偿）
-- 旧 cultivation_session（洞天）和 cultivation_room_session（修炼室）两表，
-- 前者由此重建覆盖，后者保留不动（不再使用，留作回滚保险）。
DROP TABLE IF EXISTS `cultivation_session`;
CREATE TABLE IF NOT EXISTS `cultivation_session` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '玩家ID',
  `scene` VARCHAR(16) NOT NULL DEFAULT 'room' COMMENT '场景: blessed(洞天福地)/room(修炼室)',
  `encounter_id` INT DEFAULT NULL COMMENT '来源奇遇ID（仅 blessed，结束时回写奇遇状态）',
  `tier` INT NOT NULL COMMENT '倍率档位(1/2/3)，blessed=星级，共用 starMult',
  `rounds` INT NOT NULL DEFAULT 0 COMMENT '已结算轮次（=吐纳次数）',
  `total_gained` INT NOT NULL DEFAULT 0 COMMENT '累计获得修为',
  `total_cost` INT NOT NULL DEFAULT 0 COMMENT '累计消耗金币（仅 room）',
  `cost_per_round` INT NOT NULL DEFAULT 0 COMMENT '每轮金币消耗（blessed=0）',
  `max_rounds` INT NOT NULL DEFAULT 10 COMMENT '最大轮次（blessed=10，room 用大数占位）',
  `planned_seconds` INT NOT NULL DEFAULT 0 COMMENT '计划修炼时长(秒，仅 room)',
  `last_settled_at` DATETIME(6) NULL COMMENT '最后结算时刻（离线补偿基准）',
  `ended_at` DATETIME(6) NULL COMMENT '实际结束时刻',
  `end_reason` VARCHAR(16) NULL COMMENT '结束原因: full/timeout/rounds/insufficient/stopped/error',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT '状态: active/stopped/finished',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_cultivation_player_status` (`player_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一修炼会话表（洞天福地+修炼室）';
