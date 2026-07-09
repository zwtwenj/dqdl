-- 仅新增 material 和 magic_core 两张表（幂等，不影响其它表）
CREATE TABLE IF NOT EXISTS `material` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_id` VARCHAR(32) NOT NULL COMMENT '材料ID（cl-100），与 item 表 item_id 对齐',
  `name` VARCHAR(64) NOT NULL COMMENT '材料名',
  `rarity` VARCHAR(16) DEFAULT NULL COMMENT '稀有度：常见/不常见/稀有',
  `source_mobs` TEXT DEFAULT NULL COMMENT '来源魔兽 JSON：[{mob_id,name}]',
  `description` TEXT DEFAULT NULL COMMENT '描述',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_material_item_id` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='材料表';

CREATE TABLE IF NOT EXISTS `magic_core` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_id` VARCHAR(32) NOT NULL COMMENT '魔核ID（mh-h1-1），与 item 表 item_id 对齐',
  `name` VARCHAR(64) NOT NULL COMMENT '魔核名',
  `attribute` VARCHAR(8) NOT NULL COMMENT '属性：火/冰/风/土/雷/暗/毒/水',
  `tier` TINYINT NOT NULL COMMENT '品阶：1/2/3（一阶/二阶/三阶）',
  `quality` VARCHAR(8) NOT NULL COMMENT '品质：劣质/普通/优质',
  `appearance` TEXT DEFAULT NULL COMMENT '外观描述',
  `drop_source` VARCHAR(64) DEFAULT NULL COMMENT '掉落来源描述',
  `price_min` INT NOT NULL DEFAULT 0 COMMENT '最低参考价（金币）',
  `price_max` INT NOT NULL DEFAULT 0 COMMENT '最高参考价（金币）',
  `usage_desc` TEXT DEFAULT NULL COMMENT '用途描述',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_magic_core_item_id` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='魔核表';
