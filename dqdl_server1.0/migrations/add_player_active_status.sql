-- ========== player 表加 active_status（叠加状态）字段 ==========
-- 玩家状态二维化：status=来源/基础状态，active_status=叠加状态。
-- 例：秘境中战斗 → status=3(秘境中) + active_status=7(战斗中)。
-- 只有"活动内嵌套活动"才用 active_status，其他场景保持 0。
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `player`
  ADD COLUMN `active_status` INT NOT NULL DEFAULT 0 COMMENT '叠加状态：0=无 7=战斗中（status 保持来源状态）' AFTER `status`;
