-- ========== training 表加离线标记字段 ==========
-- online：0=在线（agent实时生成日志）/ 1=离线（SSE断开，停agent）
-- offline_at：SSE断线时刻，重连时用它算断线期间该补的tick数。
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `training`
  ADD COLUMN `online` TINYINT NOT NULL DEFAULT 0 COMMENT '0=在线(agent实时) 1=离线(SSE断开)' AFTER `status`,
  ADD COLUMN `offline_at` DATETIME(6) NULL COMMENT 'SSE断线时刻（重连算断线时长用）' AFTER `online`;
