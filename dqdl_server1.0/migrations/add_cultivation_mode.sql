-- cultivation_session 增加 mode（修炼模式）+ target_id（修炼目标）两列。
-- 幂等：用 information_schema 判断列是否存在，已存在则跳过。
-- mode: qi=修为(默认) / skill=斗技 / technique=功法。skill/technique 仅修炼室(room)支持。
-- target_id: skill/technique 模式的目标 ID（skill 表或 technique 表主键），qi 模式为 NULL。

SET @db = DATABASE();
SET @col_mode := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cultivation_session' AND COLUMN_NAME = 'mode');
SET @sql_mode := IF(@col_mode = 0,
  'ALTER TABLE `cultivation_session` ADD COLUMN `mode` VARCHAR(16) NOT NULL DEFAULT ''qi'' COMMENT ''模式: qi/skill/technique'' AFTER `scene`',
  'SELECT ''mode 已存在，跳过''');
PREPARE stmt FROM @sql_mode; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_tid := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'cultivation_session' AND COLUMN_NAME = 'target_id');
SET @sql_tid := IF(@col_tid = 0,
  'ALTER TABLE `cultivation_session` ADD COLUMN `target_id` INT NULL COMMENT ''修炼目标ID（skill/technique）'' AFTER `mode`',
  'SELECT ''target_id 已存在，跳过''');
PREPARE stmt FROM @sql_tid; EXECUTE stmt; DEALLOCATE PREPARE stmt;
