-- ========== 重建 script_instance 表（剧本日志 + 演出进度） ==========
-- 之前删过一版 script_instance（那时没有消费者），现在重新建：
--   SSE 推送 + 演出运行时 已就位，本表有明确职责：
--   1) 剧本触发日志：谁/何时/哪个剧本被触发
--   2) 演出进度：当前演到哪个节点、走过的节点链路、状态(进行中/结束)
--   3) 防重复：同玩家+同剧本(outline_id)有进行中记录时不再触发
--
-- 字段说明：
--   current_node：当前所在节点 id（演出推进时更新；初始=start）
--   node_path：玩家走过的节点链路 JSON 数组（如 ["a1","b1"]；演出推进时 append）
--   status：pending(进行中) / done(已结束，玩家走到结局节点)
--   trigger_payload：触发时的钩子上下文快照（便于追溯）
--
-- 防重复规则：触发前检查 (player_id, outline_id, status='pending') 是否存在；
--   存在则跳过（同玩家同剧本进行中不重复触发）。

CREATE TABLE IF NOT EXISTS `script_instance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  -- 关联
  `outline_id` INT NOT NULL COMMENT '→ script_outline.id',
  `story_id` VARCHAR(64) NOT NULL COMMENT '→ story.story_id（冗余，便于查阅）',
  `player_id` INT NOT NULL COMMENT '触发该剧本的玩家',
  `hook` VARCHAR(32) NOT NULL COMMENT '由哪个钩子触发',
  -- 演出进度
  `current_node` VARCHAR(32) NULL COMMENT '当前所在节点 id；初始=start，演出推进时更新',
  `node_path` JSON NULL COMMENT '走过的节点链路 ["a1","b1"]，演出推进时 append',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending=进行中; done=已结束',
  -- 触发追溯
  `trigger_payload` JSON NULL COMMENT '触发时的钩子上下文快照 [{type,data}]',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '触发时间',
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_inst_player_outline_status` (`player_id`, `outline_id`, `status`),
  KEY `idx_inst_player_status` (`player_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='剧本实例（触发日志 + 演出进度 + 防重复）';
