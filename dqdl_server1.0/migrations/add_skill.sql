-- 斗技图鉴表（字段设计沿用老版本 dqdl-server/src/skill，追加 item_id 与 item 体系对齐）。
-- 本脚本幂等：可重复执行。建表用 IF NOT EXISTS，插入用 ON DUPLICATE KEY UPDATE。
--
-- 与功法表同构：
-- - rank 品阶编码（43=黄阶下品 … 11=天阶上品）。
-- - levels 按等级的命名参数表 JSON：[{level, params:{damageRate, armorPen, ...}}]。
-- - target_effects / self_effects / carried：命中附加/自身增益/携带效果 buff key 数组。
--   （重构版暂未接战斗引擎，这些列先建占位，前端斗技弹窗只展示名称/品阶/关联属性/描述。）
-- item_id 为斗技全局唯一编码（dj- 前缀），与 item 表 item_id 对齐。

CREATE TABLE IF NOT EXISTS `skill` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_id` VARCHAR(32) NOT NULL COMMENT '斗技ID（dj-001），与 item 表 item_id 对齐',
  `name` VARCHAR(64) NOT NULL COMMENT '斗技名',
  `attr` VARCHAR(16) NOT NULL COMMENT '关联属性: power/intelligence/quick/stamina',
  `rank` INT NOT NULL COMMENT '品阶: 43=黄阶下品 42=黄阶中品 ... 11=天阶上品',
  `base_damage` INT NOT NULL DEFAULT 0 COMMENT '基础伤害',
  `levels` TEXT DEFAULT NULL COMMENT '按等级命名参数表(JSON)',
  `target_effects` TEXT DEFAULT NULL COMMENT '命中附加效果buff key(JSON数组)',
  `self_effects` TEXT DEFAULT NULL COMMENT '自身增益buff key(JSON数组)',
  `carried` TEXT DEFAULT NULL COMMENT '携带型效果buff key(JSON数组)',
  `energy_cost` INT NOT NULL DEFAULT 10 COMMENT '斗气消耗',
  `max_level` INT NOT NULL DEFAULT 3 COMMENT '斗技最大等级',
  `description` TEXT DEFAULT NULL COMMENT '描述',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_skill_item_id` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='斗技表';

-- 斗技种子数据（沿用老版本 battle.seed.ts 的 SEED_SKILLS 定义）。
-- levels 数组每级含 damageRate（伤害倍率）等参数；target/self/carried 为 buff key 数组。
INSERT INTO `skill` (`item_id`, `name`, `attr`, `rank`, `base_damage`, `levels`, `target_effects`, `self_effects`, `carried`, `energy_cost`, `max_level`, `description`)
VALUES
('dj-001', '八极崩', 'power', 32, 10,
 '[{"level":1,"params":{"damageRate":1.2,"armorPen":0.30}},{"level":2,"params":{"damageRate":1.4,"armorPen":0.32}},{"level":3,"params":{"damageRate":1.6,"armorPen":0.34}},{"level":4,"params":{"damageRate":1.8,"armorPen":0.36}},{"level":5,"params":{"damageRate":2.0,"armorPen":0.38}}]',
 '["trauma","weak"]', '["power_surge"]', '["pojia"]', 15, 5,
 '玄阶中级斗技，近身强攻，暗含八重劲气，携带破甲'),
('dj-002', '焰分噬浪尺', 'power', 21, 15,
 '[{"level":1,"params":{"damageRate":1.4,"armorPen":0.40,"burnRate":1.0}},{"level":2,"params":{"damageRate":1.6,"armorPen":0.42,"burnRate":1.1}},{"level":3,"params":{"damageRate":1.9,"armorPen":0.44,"burnRate":1.2}},{"level":4,"params":{"damageRate":2.2,"armorPen":0.46,"burnRate":1.3}},{"level":5,"params":{"damageRate":2.5,"armorPen":0.48,"burnRate":1.4}}]',
 '["burn"]', '["power_surge"]', '["pojia"]', 20, 5,
 '地阶低级斗技，以玄重尺凝聚火焰，高倍率破甲'),
('dj-003', '三千雷动', 'quick', 21, 5,
 '[{"level":1,"params":{"damageRate":1.0}},{"level":2,"params":{"damageRate":1.2}},{"level":3,"params":{"damageRate":1.5}},{"level":4,"params":{"damageRate":1.8}},{"level":5,"params":{"damageRate":2.2}}]',
 '["stun"]', '["evasion","power_surge"]', '[]', 15, 5,
 '地阶低级身法，身形如电，附闪避'),
('dj-004', '吸掌', 'intelligence', 33, 8,
 '[{"level":1,"params":{"damageRate":1.0}},{"level":2,"params":{"damageRate":1.3}},{"level":3,"params":{"damageRate":1.5}},{"level":4,"params":{"damageRate":1.8}},{"level":5,"params":{"damageRate":2.0}}]',
 '["slow"]', '[]', '[]', 12, 5,
 '玄阶低级斗技，狂猛吸力牵扯'),
('dj-005', '吹火诀', 'intelligence', 33, 8,
 '[{"level":1,"params":{"damageRate":1.0}},{"level":2,"params":{"damageRate":1.2}},{"level":3,"params":{"damageRate":1.4}},{"level":4,"params":{"damageRate":1.7}},{"level":5,"params":{"damageRate":2.0}}]',
 '[]', '["power_surge"]', '[]', 12, 5,
 '玄阶低级斗技，双掌引风助火'),
('dj-006', '狮虎碎金吟', 'intelligence', 31, 12,
 '[{"level":1,"params":{"damageRate":1.2}},{"level":2,"params":{"damageRate":1.5}},{"level":3,"params":{"damageRate":1.7}},{"level":4,"params":{"damageRate":2.0}},{"level":5,"params":{"damageRate":2.3}}]',
 '["stun","weak"]', '[]', '[]', 18, 5,
 '玄阶高级声波斗技，直击灵魂'),
('dj-007', '玄冰龙翔', 'intelligence', 31, 12,
 '[{"level":1,"params":{"damageRate":1.3}},{"level":2,"params":{"damageRate":1.5}},{"level":3,"params":{"damageRate":1.8}},{"level":4,"params":{"damageRate":2.1}},{"level":5,"params":{"damageRate":2.4}}]',
 '["stun","slow"]', '["shield"]', '[]', 18, 5,
 '玄阶高级斗技，冰龙冻结万物'),
('dj-008', '风卷尘生', 'quick', 41, 6,
 '[{"level":1,"params":{"damageRate":0.9,"bleedRate":1.0}},{"level":2,"params":{"damageRate":1.1,"bleedRate":1.2}},{"level":3,"params":{"damageRate":1.4,"bleedRate":1.4}},{"level":4,"params":{"damageRate":1.6,"bleedRate":1.6}},{"level":5,"params":{"damageRate":1.9,"bleedRate":1.8}}]',
 '["bleed"]', '["power_surge"]', '[]', 12, 5,
 '黄阶高级斗技，狂暴龙卷撕裂'),
('dj-009', '铁山靠', 'stamina', 42, 8,
 '[{"level":1,"params":{"damageRate":1.0}},{"level":2,"params":{"damageRate":1.2}},{"level":3,"params":{"damageRate":1.5}},{"level":4,"params":{"damageRate":1.7}},{"level":5,"params":{"damageRate":2.0}}]',
 '["stun"]', '["shield"]', '[]', 14, 5,
 '黄阶中级斗技，土属性近身，附石化皮肤'),
('dj-010', '水龙吟', 'intelligence', 42, 7,
 '[{"level":1,"params":{"damageRate":1.0}},{"level":2,"params":{"damageRate":1.2}},{"level":3,"params":{"damageRate":1.4}},{"level":4,"params":{"damageRate":1.7}},{"level":5,"params":{"damageRate":1.9}}]',
 '[]', '["shield"]', '[]', 12, 5,
 '黄阶中级斗技，水龙旋转冲击'),
('dj-011', '火云掌', 'power', 41, 8,
 '[{"level":1,"params":{"damageRate":1.1,"burnRate":1.0}},{"level":2,"params":{"damageRate":1.3,"burnRate":1.1}},{"level":3,"params":{"damageRate":1.5,"burnRate":1.2}},{"level":4,"params":{"damageRate":1.8,"burnRate":1.3}},{"level":5,"params":{"damageRate":2.1,"burnRate":1.4}}]',
 '["burn"]', '["power_surge"]', '[]', 14, 5,
 '黄阶高级斗技，火云蔽日'),
('dj-012', '雷霆一击', 'power', 41, 9,
 '[{"level":1,"params":{"damageRate":1.1,"armorPen":0.35}},{"level":2,"params":{"damageRate":1.3,"armorPen":0.37}},{"level":3,"params":{"damageRate":1.6,"armorPen":0.39}},{"level":4,"params":{"damageRate":1.9,"armorPen":0.41}},{"level":5,"params":{"damageRate":2.2,"armorPen":0.43}}]',
 '["stun"]', '["shield"]', '["pojia"]', 16, 5,
 '黄阶高级斗技，雷霆万钧，携带破甲'),
('dj-013', '磐石护体', 'stamina', 42, 6,
 '[{"level":1,"params":{"damageRate":0.6,"shieldAmount":120}},{"level":2,"params":{"damageRate":0.8,"shieldAmount":180}},{"level":3,"params":{"damageRate":1.0,"shieldAmount":260}},{"level":4,"params":{"damageRate":1.2,"shieldAmount":360}},{"level":5,"params":{"damageRate":1.4,"shieldAmount":480}}]',
 '[]', '["barrier"]', '[]', 14, 5,
 '黄阶中级斗技，凝聚斗气化作护体盾气，吸收伤害')
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `attr` = VALUES(`attr`),
  `rank` = VALUES(`rank`),
  `base_damage` = VALUES(`base_damage`),
  `levels` = VALUES(`levels`),
  `target_effects` = VALUES(`target_effects`),
  `self_effects` = VALUES(`self_effects`),
  `carried` = VALUES(`carried`),
  `energy_cost` = VALUES(`energy_cost`),
  `max_level` = VALUES(`max_level`),
  `description` = VALUES(`description`);

-- 同步在 item 表登记（type='武技'，ref_type='skill' 指回本表），让斗技能进背包/图鉴。
-- ref_id 用子查询取 skill.id，NOT EXISTS 保证幂等。
INSERT INTO `item` (`item_id`, `name`, `type`, `icon`, `price`, `description`, `usable`, `use_effect`, `ref_type`, `ref_id`)
SELECT
  s.`item_id`, s.`name`, '武技', CONCAT('/icon/skill/', s.`item_id`, '.png'), 100, s.`description`, 0, NULL, 'skill', s.`id`
FROM `skill` s
WHERE NOT EXISTS (SELECT 1 FROM `item` i WHERE i.`item_id` = s.`item_id`);

-- 若旧版已插入过 item 行（ref_type 可能不对），修正它的 ref 关联与图标。
UPDATE `item` i
JOIN `skill` s ON s.`item_id` = i.`item_id`
SET i.`ref_type` = 'skill', i.`ref_id` = s.`id`, i.`type` = '武技', i.`name` = s.`name`,
    i.`icon` = CONCAT('/icon/skill/', s.`item_id`, '.png')
WHERE i.`item_id` LIKE 'dj-%';
