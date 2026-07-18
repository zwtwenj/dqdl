-- ========== script_outline 删除冗余列 actors / locations ==========
-- 背景：actors 与 actor_map、locations 与 location_map 信息重复
--   （前者是描述列表无 id，后者是带 id 的映射）。
-- 重构后 outline 阶段直接分配 id 写入 actor_map/location_map，
-- 不再需要无 id 的描述列表 actors/locations。删掉冗余列，表更干净。
--
-- 注意：执行前请确认 status=done 的记录 actor_map/location_map 已填充
--   （否则会丢失演员/地点信息）。本迁移不自动迁移数据，假设已完成细化或可重跑。
-- 幂等：列不存在时 DROP 会报 Unknown column，忽略即可。

ALTER TABLE `script_outline` DROP COLUMN `actors`;
ALTER TABLE `script_outline` DROP COLUMN `locations`;
