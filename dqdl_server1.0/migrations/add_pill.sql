-- 丹药表（成品丹药：回血/聚气/属性丹等，可主动使用）。
-- 与 item 表按 item_id 对齐（item.type='丹药' && item.usable=1 && item.ref_type='pill'）。
-- 本脚本幂等：可重复执行。
--
-- 效果模型（即时型，无 buff 持久化）：
--   effect_type='heal_hp'     → player.hp = min(max_hp, hp + amount)        target 固定 'hp'
--   effect_type='heal_energy' → player.energy = min(max_energy, energy+amount) target 固定 'energy'
--   effect_type='attr'        → player[target] += amount（target ∈ power/intelligence/quick/stamina/lucky）
-- buff 型丹药（带回下战）留后续，不入本表。

CREATE TABLE IF NOT EXISTS `pill` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_id` VARCHAR(32) NOT NULL COMMENT '丹药ID（与 item.item_id 对齐）',
  `name` VARCHAR(64) NOT NULL COMMENT '丹药名',
  `effect_type` VARCHAR(16) NOT NULL COMMENT '效果类型：heal_hp/heal_energy/attr',
  `target` VARCHAR(16) NOT NULL COMMENT '作用属性：hp/energy/power/intelligence/quick/stamina/lucky',
  `amount` INT NOT NULL DEFAULT 0 COMMENT '数值（加血量/加斗气量/属性增量）',
  `description` TEXT DEFAULT NULL COMMENT '药效描述',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_pill_item_id` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='丹药表（成品丹药效果定义）';

-- ========== 测试种子数据 ==========
-- 注意：使用前需保证 item 表已有对应 item_id 的行，且 usable=1、type='丹药'、ref_type='pill'。
INSERT INTO `pill` (`item_id`, `name`, `effect_type`, `target`, `amount`, `description`) VALUES
('dp-huiqi', '回气丹', 'heal_hp',     'hp',     100, '回复 100 点生命'),
('dp-juqi',  '聚气丹', 'heal_energy', 'energy',  50, '回复 50 点斗气'),
('dp-li',    '蛮力丹', 'attr',        'power',    5, '永久增加 5 点力量')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `effect_type` = VALUES(`effect_type`),
  `target` = VALUES(`target`),
  `amount` = VALUES(`amount`),
  `description` = VALUES(`description`);
