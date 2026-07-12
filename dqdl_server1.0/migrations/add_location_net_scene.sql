-- ========== 网状地图新系统：location_net + location_scene（幂等） ==========
-- 依赖：player 表（init.sql 已建）
-- 这是与旧 location 树并行的平面网状地图系统：
--   location_net   平面地图节点（整数网格 gx,gy，4 对角 X 形邻接）
--   location_scene 地图内部场景（不显示在地图上，如城市的坊市/佣兵工会/炼药师公会）
-- 不动现有 location 等表；仅给 player 加一列 scene_id；用独立测试玩家验证。

-- ---------- 平面地图节点表 ----------
CREATE TABLE IF NOT EXISTS `location_net` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL COMMENT '地点名',
  `loc_type` VARCHAR(32) NOT NULL COMMENT 'wild/city/sect/secret',
  `description` TEXT DEFAULT NULL COMMENT '描述',
  `gx` INT NOT NULL COMMENT '网格 x（整数坐标，对角邻接索引用）',
  `gy` INT NOT NULL COMMENT '网格 y',
  `is_frontier` TINYINT NOT NULL DEFAULT 1 COMMENT '1=前沿节点，仍有相邻空位可往外拓',
  `danger_level` TINYINT NOT NULL DEFAULT 0 COMMENT '危险等级（野外1-3，其它0）',
  `qi_density` INT NOT NULL DEFAULT 0 COMMENT '斗气浓郁度（野外用）',
  `tags` JSON DEFAULT NULL COMMENT '特色标签',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_grid` (`gx`, `gy`),
  KEY `idx_loc_type` (`loc_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平面网状地图节点表';

-- ---------- 地图内部场景表 ----------
CREATE TABLE IF NOT EXISTS `location_scene` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `net_id` INT NOT NULL COMMENT '所属地图节点ID → location_net.id',
  `name` VARCHAR(64) NOT NULL COMMENT '场景名（坊市/佣兵工会/炼药师公会 等）',
  `scene_type` VARCHAR(32) NOT NULL COMMENT 'market/guild/alchemy/auction/cultivation',
  `description` TEXT DEFAULT NULL COMMENT '场景描述',
  `available_actions` JSON DEFAULT NULL COMMENT '可用动作',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_net_scene` (`net_id`, `scene_type`),
  KEY `idx_scene_net` (`net_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地图内部场景表';

-- ---------- player 表加 scene_id 列 ----------
-- 注意：不带 IF NOT EXISTS（MySQL 8.0.29- 语法不支持）。
-- 若该列已存在，本句会报 "Duplicate column"，忽略即可，不影响其余语句。
ALTER TABLE `player`
  ADD COLUMN `scene_id` INT DEFAULT NULL COMMENT '当前场景 location_scene.id（NULL=不在任何场景，在地图上）';

-- ========== 种子：1 个城市（乌坦城） + 3 个默认场景 ==========
INSERT INTO `location_net` (`name`, `loc_type`, `description`, `gx`, `gy`, `is_frontier`, `danger_level`, `qi_density`, `tags`)
SELECT '乌坦城', 'city', '加玛帝国东陲的边城，商旅往来频繁。', 0, 0, 1, 0, 0, JSON_ARRAY('边城','商旅')
WHERE NOT EXISTS (SELECT 1 FROM `location_net` WHERE `gx` = 0 AND `gy` = 0);
SET @utan_id = (SELECT `id` FROM `location_net` WHERE `gx` = 0 AND `gy` = 0 LIMIT 1);

INSERT INTO `location_scene` (`net_id`, `name`, `scene_type`, `description`, `available_actions`)
SELECT @utan_id, '佣兵工会', 'guild', '乌坦城的佣兵工会分部，发布和接取各类任务，佣兵们的聚集之地。', JSON_ARRAY('quest','rest')
WHERE NOT EXISTS (SELECT 1 FROM `location_scene` WHERE `net_id` = @utan_id AND `scene_type` = 'guild');

INSERT INTO `location_scene` (`net_id`, `name`, `scene_type`, `description`, `available_actions`)
SELECT @utan_id, '坊市', 'market', '乌坦城的坊市，中低端物品交易集散地，各类商贩云集，偶有意外之宝。', JSON_ARRAY('buy','sell','explore')
WHERE NOT EXISTS (SELECT 1 FROM `location_scene` WHERE `net_id` = @utan_id AND `scene_type` = 'market');

INSERT INTO `location_scene` (`net_id`, `name`, `scene_type`, `description`, `available_actions`)
SELECT @utan_id, '炼药师公会', 'alchemy', '乌坦城炼药师公会分部，炼药师考核与丹药交易的权威场所。', JSON_ARRAY('buy','sell','cultivate')
WHERE NOT EXISTS (SELECT 1 FROM `location_scene` WHERE `net_id` = @utan_id AND `scene_type` = 'alchemy');

-- ========== 独立测试玩家（demo 专用，与真实玩家隔离） ==========
-- character_id 用一个负数避开真实角色；location_id 指向乌坦城
INSERT INTO `player` (`character_id`, `name`, `level`, `location_id`, `scene_id`)
SELECT -999, '_mapdemo_test', 1, @utan_id, NULL
WHERE NOT EXISTS (SELECT 1 FROM `player` WHERE `name` = '_mapdemo_test');
