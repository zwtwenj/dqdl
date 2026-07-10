-- 仅新增 agent_call_log 表（幂等，不影响其它表）
CREATE TABLE IF NOT EXISTS `agent_call_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `call_type` VARCHAR(32) NOT NULL COMMENT '调用类型：map/training/dialog/encounter/breakthrough/dungeon/event',
  `ref_type` VARCHAR(32) DEFAULT NULL COMMENT '业务关联类型，如 training_log',
  `ref_id` INT DEFAULT NULL COMMENT '业务关联ID，如 training_log.id',
  `model` VARCHAR(64) NOT NULL COMMENT '模型名，如 deepseek-chat',
  `prompt_tokens` INT NOT NULL DEFAULT 0 COMMENT '输入token（上下文长度）',
  `completion_tokens` INT NOT NULL DEFAULT 0 COMMENT '输出token',
  `total_tokens` INT NOT NULL DEFAULT 0 COMMENT '总token',
  `cache_hit_tokens` INT NOT NULL DEFAULT 0 COMMENT '缓存命中token（prompt_cache_hit_tokens）',
  `cache_miss_tokens` INT NOT NULL DEFAULT 0 COMMENT '缓存未命中token',
  `cache_hit_ratio` DECIMAL(5,4) DEFAULT NULL COMMENT '缓存命中率=cache_hit/(cache_hit+cache_miss)，0~1',
  `temperature` DECIMAL(3,2) DEFAULT NULL COMMENT '采样温度',
  `duration_ms` INT DEFAULT NULL COMMENT '调用耗时（毫秒）',
  `success` TINYINT NOT NULL DEFAULT 1 COMMENT '1=成功 0=失败/异常',
  `error_msg` VARCHAR(500) DEFAULT NULL COMMENT '失败时的错误信息',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_agent_call_type` (`call_type`),
  KEY `idx_agent_call_ref` (`ref_type`, `ref_id`),
  KEY `idx_agent_call_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent调用日志表（token消耗统计）';
