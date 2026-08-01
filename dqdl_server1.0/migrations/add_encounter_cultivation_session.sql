-- ========== encounter 表加 cultivation_session_id（关联洞天福地修炼会话）==========
-- 一个 encounter(kind=cultivate) 对应一条 cultivation_session（unique 约束保证一对一）。
-- 前端查 encounter 详情时 join cultivation_session 拿修炼数据（吐纳次数/修为/状态）。
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `encounter`
  ADD COLUMN `cultivation_session_id` INT NULL COMMENT '关联的修炼会话ID（洞天福地，一对一）' AFTER `star`;

-- 唯一约束：一个 encounter 最多关联一条 session
ALTER TABLE `encounter`
  ADD UNIQUE INDEX `uq_encounter_cult_session` (`cultivation_session_id`);
