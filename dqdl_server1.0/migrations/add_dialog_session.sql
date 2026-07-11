-- ========== NPC 对话会话化重构（双轨会话结构） ==========
-- server 端：dialog_session（业务视角，每次打开一行，messages 存对话内容 JSON 数组）
-- agent 端：agent_dialog_call（智能体视角，每次 deepseek 调用一行，server_session_id 绑定）
-- 两张表一侧一张，会话 id 是唯一耦合键，利于 server/agent 分布式部署。
-- 废弃旧 dialog_log（被两新表取代）。

-- ---------- server 端：会话主表 ----------
CREATE TABLE IF NOT EXISTS `dialog_session` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '玩家ID',
  `npc_id` INT NOT NULL COMMENT 'NPCID',
  `location_id` INT DEFAULT NULL COMMENT '对话发生地点ID',
  `title` VARCHAR(128) NOT NULL COMMENT '会话标题（NPC名·时间，便于后台展示）',
  `messages` JSON NOT NULL COMMENT '对话内容数组 [{role:player|npc, time, message}]',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '1=进行中 2=已关闭',
  `rounds` INT NOT NULL DEFAULT 0 COMMENT '轮次（冗余，避免每次解析JSON）',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_dialog_session_player_npc` (`player_id`, `npc_id`),
  KEY `idx_dialog_session_npc` (`npc_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='NPC对话会话表（业务视角）';

-- ---------- agent 端：会话调用记录表（每次 deepseek 调用一行） ----------
CREATE TABLE IF NOT EXISTS `agent_dialog_call` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `server_session_id` INT NOT NULL COMMENT '绑定 dialog_session.id（跨服务唯一耦合键）',
  `call_index` INT NOT NULL COMMENT '会话内第几次调用（1=开场白）',
  `messages` TEXT COMMENT '完整 messages 快照 JSON（system+history+user，第N次天然含前N-1次记忆）',
  `player_input` VARCHAR(500) DEFAULT NULL COMMENT '本次玩家输入',
  `reply` TEXT COMMENT '本次回复',
  `model` VARCHAR(64) DEFAULT NULL COMMENT '模型名',
  `prompt_tokens` INT NOT NULL DEFAULT 0,
  `completion_tokens` INT NOT NULL DEFAULT 0,
  `total_tokens` INT NOT NULL DEFAULT 0,
  `cache_hit_tokens` INT NOT NULL DEFAULT 0 COMMENT '缓存命中token',
  `cache_miss_tokens` INT NOT NULL DEFAULT 0 COMMENT '缓存未命中token',
  `duration_ms` INT DEFAULT NULL COMMENT '调用耗时（毫秒）',
  `success` TINYINT NOT NULL DEFAULT 1 COMMENT '1=成功 0=失败',
  `error_msg` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_agent_dialog_call_session` (`server_session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='NPC对话调用记录表（智能体视角，精细信息）';

-- 废弃旧 dialog_log 表（被 dialog_session + agent_dialog_call 取代）
DROP TABLE IF EXISTS `dialog_log`;
