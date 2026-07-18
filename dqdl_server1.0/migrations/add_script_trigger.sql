-- ========== 剧本触发配置 + 剧本实例 ==========
-- 1) script_outline 加 3 字段：钩子名 / 触发条件 / 触发概率
--    一个剧本可绑一个钩子(hook=NULL 表示纯存档，不参与自动触发)。
--    触发条件用通用操作符格式：{type:{field:{op,val}}}
--      例：{player:{level:{op:'>=',val:6}, money:{op:'>=',val:10000}}, location:{loc_type:{op:'==',val:'wild'}}}
--      op 支持：> >= < <= == != in
-- 2) 新表 script_instance：玩家命中触发后写入的「待演出」记录。
--    本轮只到入库(status=pending)，演出运行时下一轮做。

-- ---- script_outline 加字段 ----
ALTER TABLE `script_outline`
  ADD COLUMN `hook` VARCHAR(32) NULL
    COMMENT '触发钩子名(enter_scene/player_breakthrough/technique_breakthrough/enter_game/cultivation_end)；NULL=不自动触发'
    AFTER `title`,
  ADD COLUMN `trigger_conditions` JSON NULL
    COMMENT '触发条件 {type:{field:{op,val}}}；空=无条件(仅按概率)'
    AFTER `hook`,
  ADD COLUMN `trigger_rate` INT NULL DEFAULT 100
    COMMENT '触发概率0-100(掘骰子命中率)；NULL或100=必定触发'
    AFTER `trigger_conditions`;

-- ---- script_instance 表 ----
CREATE TABLE IF NOT EXISTS `script_instance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `story_id` VARCHAR(64) NOT NULL COMMENT '→ story.story_id',
  `outline_id` INT NOT NULL COMMENT '→ script_outline.id',
  `player_id` INT NOT NULL COMMENT '触发该剧本的玩家',
  `hook` VARCHAR(32) NOT NULL COMMENT '由哪个钩子触发',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending'
    COMMENT 'pending=待演出; playing=演出中; done=已结束; expired=已过期',
  `trigger_payload` JSON NULL COMMENT '触发时的上下文快照 [{type,data}]',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_inst_player_status` (`player_id`, `status`),
  KEY `idx_inst_hook` (`hook`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='剧本实例(玩家触发的待演出剧本记录)';
