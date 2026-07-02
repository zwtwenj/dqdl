-- ============================================================
--  Agent 动态事件编排：表改名数据迁移
--  执行前提：后端已用新 entity 启动过一次（synchronize=true 会自动建新表）。
--  本脚本把旧表数据搬到新表，验证无误后再 DROP 旧表。
--  执行前请务必备份数据库。
-- ============================================================

-- 1) 从旧表搬数据到新表（仅当新表为空、旧表有数据时）
INSERT INTO event_template (
  event_id, title, trigger_type, chance, `conditions`, nodes,
  weight, `once`, handler, enabled, source, trigger_kind, created_at, updated_at
)
SELECT
  event_id, title, trigger_type, chance, `conditions`, nodes,
  weight, `once`, handler, enabled,
  'manual' AS source,           -- 旧数据一律标记为手工来源
  'probabilistic' AS trigger_kind,
  created_at, updated_at
FROM random_event
WHERE NOT EXISTS (SELECT 1 FROM event_template);

INSERT INTO event_instance (
  player_id, event_id, status, process, created_at, updated_at
)
SELECT
  player_id, event_id, status, process, created_at, updated_at
FROM random_event_log
WHERE NOT EXISTS (SELECT 1 FROM event_instance);

-- 2) 校验：行数应一致
-- SELECT (SELECT COUNT(*) FROM random_event) AS old_t,
--        (SELECT COUNT(*) FROM event_template) AS new_t;
-- SELECT (SELECT COUNT(*) FROM random_event_log) AS old_i,
--        (SELECT COUNT(*) FROM event_instance) AS new_i;

-- 3) 验证无误后，删除旧表（注释打开执行）
-- DROP TABLE random_event_log;
-- DROP TABLE random_event;

-- event_dispatch 表由后端 synchronize=true 自动创建，无需手动建。
