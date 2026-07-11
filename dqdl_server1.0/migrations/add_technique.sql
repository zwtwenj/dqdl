-- 功法图鉴表（字段设计沿用老版本 dqdl-server，追加 item_id 与 item 体系对齐）。
-- 本脚本幂等：可重复执行。建表用 IF NOT EXISTS，插入用 ON DUPLICATE KEY UPDATE。
--
-- 注意：若此前执行过本表的旧版本（bonus_power 等列），这里会先 DROP 重建。
-- 功法表当前只有测试数据，DROP 安全。

DROP TABLE IF EXISTS `technique`;

CREATE TABLE IF NOT EXISTS `technique` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_id` VARCHAR(32) NOT NULL COMMENT '功法ID（gf-h1-1），与 item 表 item_id 对齐',
  `name` VARCHAR(64) NOT NULL COMMENT '功法名',
  `attribute` VARCHAR(8) NOT NULL COMMENT '属性：金/木/水/火/土/风/雷',
  `rank` INT NOT NULL COMMENT '品阶: 43=黄阶下品 42=黄阶中品 ... 11=天阶上品',
  `growth` INT NOT NULL DEFAULT 10 COMMENT '修为增长速度',
  `base` TEXT DEFAULT NULL COMMENT '基础属性加成(JSON): 扁平{power:5} 或 按等级[{level,params,max_cultivation}]',
  `max_level` INT NOT NULL DEFAULT 3 COMMENT '功法最大等级',
  `description` TEXT DEFAULT NULL COMMENT '描述',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_technique_item_id` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='功法表';

-- 弄焰诀：黄阶下品(rank=43) 火属性功法。
-- base 用按等级数组结构：每级给出属性加成 params 与升至下一级所需修为 max_cultivation。
-- 等级1: 力量+2/体质+1，升2级需100修为；等级2: 力量+3/体质+1，升3级需200修为。
INSERT INTO `technique` (`item_id`, `name`, `attribute`, `rank`, `growth`, `base`, `max_level`, `description`)
VALUES (
  'gf-h1-1',
  '弄焰诀',
  '火',
  43,
  10,
  '[{"level":1,"params":{"power":2,"stamina":1},"max_cultivation":100},{"level":2,"params":{"power":3,"stamina":1},"max_cultivation":200}]',
  3,
  '斗气大陆流传甚广的黄阶下品火属性功法，虽不甚精妙，胜在门槛极低、易于上手。修炼至大成可在掌心凝聚一簇斗气火焰，用于点火、照明或灼烧敌人。'
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `attribute` = VALUES(`attribute`),
  `rank` = VALUES(`rank`),
  `growth` = VALUES(`growth`),
  `base` = VALUES(`base`),
  `max_level` = VALUES(`max_level`),
  `description` = VALUES(`description`);

-- 同步在 item 表登记一行（type='功法'，ref_type='technique' 指回本表），让弄焰诀能进背包。
-- ref_id 用子查询取 technique.id，NOT EXISTS 保证幂等。
INSERT INTO `item` (`item_id`, `name`, `type`, `icon`, `price`, `description`, `usable`, `use_effect`, `ref_type`, `ref_id`)
SELECT
  t.`item_id`, t.`name`, '功法', NULL, 100, t.`description`, 0, NULL, 'technique', t.`id`
FROM `technique` t
WHERE t.`item_id` = 'gf-h1-1'
  AND NOT EXISTS (SELECT 1 FROM `item` i WHERE i.`item_id` = 'gf-h1-1');

-- 若旧版已插入过 item 行（ref_type 可能不对），修正它的 ref 关联。
UPDATE `item` i
JOIN `technique` t ON t.`item_id` = i.`item_id`
SET i.`ref_type` = 'technique', i.`ref_id` = t.`id`, i.`type` = '功法', i.`name` = t.`name`
WHERE i.`item_id` = 'gf-h1-1';
