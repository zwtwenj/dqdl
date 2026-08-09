-- ========== story_event_instance 加 pending_task_id / pending_goto（故事等待任务完成） ==========
-- 故事推进到带"发布任务"连线的节点时：创建任务 + 记 pending_task_id / pending_goto，
-- 故事停在当前节点。任务完成（如前往某地到达目标点）后：清字段、推进到 pending_goto。
-- 非空时 advance 应拒绝重复推进，避免重复发布任务。
--
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `story_event_instance`
  ADD COLUMN `pending_task_id` INT DEFAULT NULL COMMENT '故事正在等待该任务完成（task.id；非空时故事停在当前节点）' AFTER `from_status`,
  ADD COLUMN `pending_goto` VARCHAR(32) DEFAULT NULL COMMENT '任务完成后推进到的目标节点（执行任务连线时记下）' AFTER `pending_task_id`;
