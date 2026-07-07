-- ============================================================
--  斗气大陆 后端（重构版）数据库初始化脚本 v2
--  架构：网游模式 — 账号(user) → 角色(character, 最多3) → player
--        全局唯一地图(location)，所有角色共享
--  用法：mysql -u root -p dqdl1.0 < init.sql
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `location`;
DROP TABLE IF EXISTS `player`;
DROP TABLE IF EXISTS `character`;
DROP TABLE IF EXISTS `user`;

SET FOREIGN_KEY_CHECKS = 1;

-- ========== 账号表 ==========
CREATE TABLE `user` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(32) NOT NULL COMMENT '登录账号（唯一）',
  `password` VARCHAR(100) NOT NULL COMMENT 'bcrypt 密码哈希',
  `nickname` VARCHAR(32) DEFAULT NULL COMMENT '昵称（可选）',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_user_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='账号表';

-- ========== 角色表（原 save 表，网游模式：一个账号最多3个角色） ==========
CREATE TABLE `character` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NOT NULL COMMENT '所属账号 ID',
  `slot` TINYINT NOT NULL COMMENT '角色序号 1/2/3',
  `name` VARCHAR(64) DEFAULT NULL COMMENT '角色名（玩家自定义）',
  `content` JSON COMMENT '角色扩展数据(JSON，预留)',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_user_slot` (`user_id`, `slot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- ========== 玩家表（一个角色对应一个 player） ==========
CREATE TABLE `player` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `character_id` INT NOT NULL COMMENT '所属角色ID（一个角色一个 player）',
  `name` VARCHAR(32) NOT NULL COMMENT '角色名',
  `level` INT NOT NULL DEFAULT 1 COMMENT '等级',
  `location_id` INT DEFAULT NULL COMMENT '当前位置 location_id（全局地图）',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_player_character` (`character_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='玩家表';

-- ========== 地点表（全局唯一地图树，所有角色共享，无 save_id） ==========
CREATE TABLE `location` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `loc_type` VARCHAR(32) NOT NULL COMMENT 'continent/region/empire/city/wild/sect/secret/district/scene',
  `description` TEXT,
  `depth` TINYINT NOT NULL DEFAULT 0,
  `danger_level` TINYINT NOT NULL DEFAULT 0 COMMENT '危险等级（野外1-3，其它0）',
  `qi_density` INT NOT NULL DEFAULT 0 COMMENT '斗气浓郁度（野外用）',
  `is_fixed` TINYINT NOT NULL DEFAULT 0 COMMENT '1=固定节点（不可删除）',
  `is_expanded` TINYINT NOT NULL DEFAULT 0 COMMENT '1=子节点已生成',
  `available_actions` JSON DEFAULT NULL COMMENT '可用动作',
  `tags` JSON DEFAULT NULL COMMENT '特色标签',
  `parent_id` INT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_depth` (`depth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地点表（全局地图树）';

-- ========== 默认账号 admin/123456 ==========
INSERT INTO `user` (`username`, `password`, `nickname`)
SELECT 'admin', '$2b$10$Er2COhH07mfx91Wr8LZVTuUi3elpBsYIDT1hy7CVl4ZPkYq8isj/2', '管理员'
WHERE NOT EXISTS (SELECT 1 FROM `user` WHERE `username` = 'admin');

-- ========== 全局地图初始种子（固定：斗气大陆 → 4区域） ==========
INSERT INTO `location` (`name`, `loc_type`, `description`, `depth`, `danger_level`, `is_fixed`, `is_expanded`, `parent_id`) VALUES
('斗气大陆', 'continent', '斗气大陆，强者为尊的世界', 0, 0, 1, 1, NULL);
SET @continent_id = LAST_INSERT_ID();
INSERT INTO `location` (`name`, `loc_type`, `description`, `depth`, `danger_level`, `is_fixed`, `is_expanded`, `parent_id`, `tags`) VALUES
('西北区域', 'region', '斗气大陆西北方，位置偏僻但势力盘根错节', 1, 0, 1, 0, @continent_id, NULL),
('中州', 'region', '斗气大陆最繁华的核心区域，强者云集', 1, 0, 1, 0, @continent_id, NULL),
('黑角域', 'region', '斗气大陆最混乱的三不管地带', 1, 3, 1, 0, @continent_id, JSON_ARRAY('混乱', '高危')),
('隐秘空间界', 'region', '远古八族等顶级势力隐居的独立空间', 1, 5, 1, 0, @continent_id, JSON_ARRAY('神秘', '顶级势力'));
