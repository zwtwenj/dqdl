-- ========== 删除 script_instance 表 ==========
-- 背景：本轮剧本触发引擎只做"检查+掘骰子"，命中后只打 log 不入库。
--   script_instance 表是"剧本实例(玩家演出进度)"的预留，本轮用不到，
--   等下一轮真正做演出运行时(前端拉剧本→弹窗→选选项→推进)再重新设计实例表。
--   保留 script_outline 的 hook/trigger_conditions/trigger_rate（触发引擎仍需读取）。
-- 幂等：表不存在时 DROP 会报 Unknown table，忽略即可。

DROP TABLE IF EXISTS `script_instance`;
