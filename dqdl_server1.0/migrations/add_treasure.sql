-- ========== 宝物系统 ==========
-- treasure 表：宝物定义（独立于 item）。玩家装备后提供属性加成与被动效果。
-- 每件宝物在 item 表有一条"物品形态"（type='宝物', ref_type='treasure', ref_id=宝物id, usable=1），
-- 玩家从背包"使用"该物品 → 装备到 player.treasures(JSON [{id,slot}]) 并消耗物品；
-- 卸下 → 按 treasure.item_id 返还物品形态到背包。
-- player.treasures 列在 init.sql 已建（default '[]'），无需迁移。

CREATE TABLE IF NOT EXISTS `treasure` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL COMMENT '宝物名',
  `icon` VARCHAR(64) DEFAULT NULL COMMENT '图标(emoji或图片URL)',
  `description` TEXT DEFAULT NULL COMMENT '描述',
  `category` VARCHAR(32) NOT NULL DEFAULT '饰品' COMMENT '部位:戒指/靴/镜/甲/饰…(同类限带约束)',
  `rank` INT NOT NULL DEFAULT 43 COMMENT '品阶编码(43=黄阶下品)',
  `stats` VARCHAR(500) NOT NULL DEFAULT '{}' COMMENT '属性加成JSON {power,intelligence,quick,stamina,lucky,hp,energy}',
  `effects` VARCHAR(500) DEFAULT NULL COMMENT '被动效果JSON {cultivation_efficiency:5}',
  `unique_cat_max` INT DEFAULT NULL COMMENT '同category装备上限(null=不限)',
  `item_id` VARCHAR(32) DEFAULT NULL COMMENT '对应item表物品形态的item_id(卸下返还)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_treasure_item_id` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='宝物定义表';

-- ========== 种子数据：3 件宝物 + 对应 item 物品形态 ==========
-- 宝物定义
INSERT INTO `treasure` (`name`, `icon`, `description`, `category`, `rank`, `stats`, `effects`, `unique_cat_max`, `item_id`) VALUES
('玄铁戒指', '💍', '以玄铁铸就的戒指，坚固耐用，能少量提升体质与生命，并加快修炼效率。', '戒指', 43,
 '{"stamina":5,"hp":50}', '{"cultivation_efficiency":5}', 2, 'bw-xthj'),
('凌风靴', '👢', '轻若无物的灵靴，穿戴者步履如风，大幅提升敏捷。', '靴', 43,
 '{"quick":10}', NULL, 1, 'bw-lfxz'),
('聚灵镜', '🪞', '能汇聚天地灵气的古镜，提升智力与斗气上限。', '镜', 42,
 '{"intelligence":8,"energy":30}', NULL, 1, 'bw-jlj')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- 对应 item 物品形态（type='宝物', ref_type='treasure', ref_id=宝物id, usable=1）
INSERT INTO `item` (`item_id`, `name`, `type`, `icon`, `price`, `description`, `usable`, `use_effect`, `ref_type`, `ref_id`) VALUES
('bw-xthj', '玄铁戒指', '宝物', '💍', 500, '以玄铁铸就的戒指，使用即可装备。', 1, NULL, 'treasure', (SELECT id FROM treasure WHERE item_id='bw-xthj')),
('bw-lfxz', '凌风靴', '宝物', '👢', 800, '轻若无物的灵靴，使用即可装备。', 1, NULL, 'treasure', (SELECT id FROM treasure WHERE item_id='bw-lfxz')),
('bw-jlj', '聚灵镜', '宝物', '🪞', 1200, '能汇聚天地灵气的古镜，使用即可装备。', 1, NULL, 'treasure', (SELECT id FROM treasure WHERE item_id='bw-jlj'))
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);
