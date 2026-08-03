-- ========== battle_log 表加战斗状态字段（战斗开始即写，支持还原） ==========
-- 战斗中持久化玩家/怪物快照 + 日志，刷新/断线可还原当前回合（不重演战斗）。
-- status：active=进行中 / finished=已结束（与战斗结果无关）
-- player_state / mob_state：战斗快照 JSON（hp/energy/buffs/skills）
-- from_status：来源状态（还原时参考，如秘境中=3）
-- 历史行（status 无值）视为 finished（查询只匹配 active）。
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `battle_log`
  ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'finished' COMMENT 'active=进行中 finished=已结束' AFTER `result`,
  ADD COLUMN `player_state` TEXT NULL COMMENT '玩家战斗快照JSON(hp/energy/buffs/skills)' AFTER `status`,
  ADD COLUMN `mob_state` TEXT NULL COMMENT '怪物战斗快照JSON(hp/buffs)' AFTER `player_state`,
  ADD COLUMN `from_status` INT NOT NULL DEFAULT 1 COMMENT '来源状态(还原时参考)' AFTER `mob_state`;
