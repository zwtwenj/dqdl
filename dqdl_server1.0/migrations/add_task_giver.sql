-- ========== task 表加发布人字段 ==========
-- giver = 任务发布人。佣兵公会任务统一由"佣兵公会接待员"发布。
-- 后续可按 giver_npc_id 关联到具体 NPC（dynamic_npc / static_npc），当前仅存快照名。
-- 历史已生成的 task 行这两列为 NULL，前端读取时兜底显示默认发布人名。
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `task`
  ADD COLUMN `giver_npc_id` INT NULL COMMENT '发布人NPC ID（NULL=系统/接待员，仅存快照）' AFTER `delivery`;

ALTER TABLE `task`
  ADD COLUMN `giver_npc_name` VARCHAR(64) NULL COMMENT '发布人NPC名（快照）' AFTER `giver_npc_id`;
