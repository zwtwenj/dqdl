-- ========== pill 表加 effect（效果JSON）字段 ==========
-- 效果配置改为 JSON（key→参数），支持单/多效果叠加，替代原 effect_type/target/amount 三列。
-- 旧三列保留不删（向后兼容历史数据），新逻辑只读 effect。
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `pill`
  ADD COLUMN `effect` TEXT NULL COMMENT '效果JSON：{key:params}，如 {"heal_hp":30}' AFTER `name`;
