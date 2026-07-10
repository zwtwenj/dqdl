-- 给 backpack 表加 slot 列（背包格位置1-350）+ 唯一索引
-- 幂等：列已存在则跳过
ALTER TABLE `backpack` ADD COLUMN IF NOT EXISTS `slot` INT DEFAULT NULL COMMENT '背包格位置1-350（null=待分配）';

-- 给已有数据分配 slot（按 acquired_at 顺序从1开始）
SET @s := 0;
SET @prev_player := -1;
UPDATE `backpack` b
JOIN (
  SELECT id,
         @r := IF(@prev_player = player_id, @r + 1, 1) AS new_slot,
         @prev_player := player_id
  FROM `backpack`
  ORDER BY player_id, acquired_at
) t ON b.id = t.id
SET b.slot = t.new_slot
WHERE b.slot IS NULL;

-- 加唯一索引（player_id, slot）
ALTER TABLE `backpack` DROP INDEX IF EXISTS `idx_backpack_player_slot`;
ALTER TABLE `backpack` ADD UNIQUE KEY `idx_backpack_player_slot` (`player_id`, `slot`);
