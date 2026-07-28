-- ============================================================
-- 删除 player 表的 5 个当前属性字段（power/intelligence/quick/stamina/lucky）
--
-- 背景：当前属性改为实时计算（= base_* + levelAttrBonus(level)），不再持久化存储。
-- 这 5 个字段本就等于 base + 等级加成，删除后由 findOne 实时聚合算回，数值不变。
-- 详见 player.entity.ts 头注释。
--
-- ⚠️ 破坏性迁移：会丢失这 5 列数据（但可由 base + level 实时还原，无实际数值损失）。
-- 执行前建议备份：mysqldump dqdl player > player_backup.sql
-- ============================================================

ALTER TABLE `player` DROP COLUMN `power`;
ALTER TABLE `player` DROP COLUMN `intelligence`;
ALTER TABLE `player` DROP COLUMN `quick`;
ALTER TABLE `player` DROP COLUMN `stamina`;
ALTER TABLE `player` DROP COLUMN `lucky`;
