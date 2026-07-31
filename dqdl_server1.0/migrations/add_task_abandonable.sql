-- ========== task 表加 abandonable（是否可放弃）字段 ==========
-- 控制任务能否被玩家主动放弃。默认 1（可放弃），主线等不可放弃任务设 0。
-- 放弃的任务状态置 delete（复用现有状态机，不新增状态）。
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `task`
  ADD COLUMN `abandonable` TINYINT NOT NULL DEFAULT 1 COMMENT '是否可放弃：1=可放弃 0=不可放弃（如主线任务）' AFTER `star`;
