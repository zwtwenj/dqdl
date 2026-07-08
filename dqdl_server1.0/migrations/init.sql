-- ============================================================
--  斗气大陆 后端（重构版）数据库初始化脚本 v2
--  架构：网游模式 — 账号(user) → 角色(character, 最多3) → player
--        全局唯一地图(location)，所有角色共享
--  用法：mysql -u root -p dqdl1.0 < init.sql
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `location_gen_rule`;
DROP TABLE IF EXISTS `item`;
DROP TABLE IF EXISTS `alchemy`;
DROP TABLE IF EXISTS `mob`;
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
  `base_power` INT NOT NULL DEFAULT 0 COMMENT '基础力量(创建固定，不含等级成长)',
  `base_intelligence` INT NOT NULL DEFAULT 0 COMMENT '基础智力(创建固定，不含等级成长)',
  `base_quick` INT NOT NULL DEFAULT 0 COMMENT '基础敏捷(创建固定，不含等级成长)',
  `base_stamina` INT NOT NULL DEFAULT 0 COMMENT '基础体质(创建固定，不含等级成长)',
  `base_lucky` INT NOT NULL DEFAULT 0 COMMENT '基础运气(创建固定，不含等级成长)',
  `power` INT NOT NULL DEFAULT 5 COMMENT '力量',
  `intelligence` INT NOT NULL DEFAULT 5 COMMENT '智力',
  `quick` INT NOT NULL DEFAULT 5 COMMENT '敏捷',
  `stamina` INT NOT NULL DEFAULT 5 COMMENT '体质',
  `lucky` INT NOT NULL DEFAULT 5 COMMENT '运气',
  `hp` INT NOT NULL DEFAULT 50 COMMENT '当前生命值',
  `max_hp` INT NOT NULL DEFAULT 50 COMMENT '生命上限(stamina*10)',
  `energy` INT NOT NULL DEFAULT 20 COMMENT '当前斗气值',
  `max_energy` INT NOT NULL DEFAULT 20 COMMENT '斗气上限(level*20)',
  `cultivation` INT NOT NULL DEFAULT 0 COMMENT '修为',
  `level_cultivation` INT NOT NULL DEFAULT 100 COMMENT '当前等级修为上限(K*level^2)',
  `exp` INT NOT NULL DEFAULT 0 COMMENT '战斗经验',
  `money` INT NOT NULL DEFAULT 0 COMMENT '金币',
  `buff` TEXT DEFAULT NULL COMMENT 'Buff列表(JSON数组)',
  `skill` TEXT NOT NULL DEFAULT '[]' COMMENT '玩家斗技列表(JSON数组)',
  `technique` TEXT NOT NULL DEFAULT '[]' COMMENT '已习得功法及进度(JSON数组)',
  `treasures` TEXT NOT NULL DEFAULT '[]' COMMENT '已装备宝物(JSON):[{id,slot}]',
  `extra_attrs` TEXT NOT NULL DEFAULT '{}' COMMENT '扩展属性(JSON分组)',
  `breakthrough_bonus` INT NOT NULL DEFAULT 0 COMMENT '下次突破成功率加成(百分比)',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '状态: 1=空闲 2=历练 3=副本 4=洞天 5=修炼室 6=采集',
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
  `common_mobs` TEXT DEFAULT NULL COMMENT '常见魔兽 JSON：[{mob_id,name}]',
  `common_herbs` TEXT DEFAULT NULL COMMENT '常见药草 JSON：[{item_id,name}]',
  `parent_id` INT DEFAULT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_parent` (`parent_id`),
  KEY `idx_depth` (`depth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地点表（全局地图树）';

-- ========== 魔兽表（图鉴，全局共享） ==========
CREATE TABLE `mob` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `mob_id` VARCHAR(64) NOT NULL COMMENT '图鉴ID（WB-001 / AGENT- 前缀）',
  `name` VARCHAR(64) NOT NULL COMMENT '怪物名称',
  `description` TEXT DEFAULT NULL COMMENT '描述（外观/能力/弱点）',
  `attribute` VARCHAR(8) DEFAULT NULL COMMENT '元素属性：火/冰/风/土/雷/暗/毒/木/水',
  `power` INT NOT NULL DEFAULT 0 COMMENT '战力编码（3=斗之气三段，13=三星斗者）',
  `intelligence` INT NOT NULL DEFAULT 0 COMMENT '智力',
  `quick` INT NOT NULL DEFAULT 0 COMMENT '敏捷',
  `stamina` INT NOT NULL DEFAULT 0 COMMENT '体力',
  `level` INT NOT NULL DEFAULT 1 COMMENT '等级',
  `drops` TEXT DEFAULT NULL COMMENT '掉落物 JSON：[{item_id,name,rate,min,max,type}]',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_mob_mob_id` (`mob_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='魔兽表';

-- ========== 草药表（炼丹原料） ==========
CREATE TABLE `alchemy` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_id` VARCHAR(32) NOT NULL COMMENT '草药ID（yb-001）',
  `name` VARCHAR(64) NOT NULL COMMENT '草药名',
  `tier` TINYINT NOT NULL DEFAULT 1 COMMENT '品阶 1/2/3',
  `category` VARCHAR(32) DEFAULT NULL COMMENT '分类',
  `element` TEXT DEFAULT NULL COMMENT '元素能量 JSON：{"木":10,"火":5}',
  `rarity` VARCHAR(16) DEFAULT NULL COMMENT '稀有度',
  `habitat` VARCHAR(128) DEFAULT NULL COMMENT '产地',
  `appearance` TEXT DEFAULT NULL COMMENT '外观描述',
  `effect` TEXT DEFAULT NULL COMMENT '药效描述',
  `price` INT NOT NULL DEFAULT 0 COMMENT '参考价格（金币）',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_alchemy_item_id` (`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='草药表';

-- ========== 物品模板表（能进入背包的物品统一定义） ==========
CREATE TABLE `item` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_id` VARCHAR(32) NOT NULL COMMENT '全局唯一ID（dp-/mh-/yb-/pf-/dl- 等）',
  `name` VARCHAR(128) NOT NULL COMMENT '物品名',
  `type` VARCHAR(32) NOT NULL COMMENT '类别：丹药/武器/功法/武技/防具/材料/消耗品/特殊/丹方/丹炉/草药',
  `icon` VARCHAR(128) DEFAULT NULL COMMENT '图标地址',
  `price` INT NOT NULL DEFAULT 0 COMMENT '参考价格（金币）',
  `description` TEXT DEFAULT NULL COMMENT '描述',
  `usable` TINYINT NOT NULL DEFAULT 0 COMMENT '1=可主动使用',
  `use_effect` TEXT DEFAULT NULL COMMENT '使用效果 JSON：{type,fn|buff,params|scope}',
  `ref_type` VARCHAR(32) DEFAULT NULL COMMENT '链接目标表名：alchemy/pill_recipe/furnace 等，null=无',
  `ref_id` INT DEFAULT NULL COMMENT '链接目标表的自增 id，配合 ref_type 使用',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_item_item_id` (`item_id`),
  KEY `idx_item_ref` (`ref_type`, `ref_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物品模板表';

-- ========== 地点生成规则表（按 depth 存 AI 生成 prompt 模板） ==========
CREATE TABLE `location_gen_rule` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `depth` TINYINT NOT NULL COMMENT '适用于该深度的子节点（父节点 depth+1 = 此值）',
  `loc_type` VARCHAR(32) NOT NULL COMMENT '期望生成的 loc_type（mixed 表示混合）',
  `min_children` TINYINT NOT NULL DEFAULT 2 COMMENT '最少子节点数',
  `max_children` TINYINT NOT NULL DEFAULT 6 COMMENT '最多子节点数',
  `naming_style` VARCHAR(255) NOT NULL COMMENT '命名风格描述',
  `danger_range` VARCHAR(16) NOT NULL COMMENT '危险等级范围，如 1-3',
  `world_constraints` TEXT NOT NULL COMMENT '世界观约束',
  `gen_prompt` TEXT NOT NULL COMMENT '生成 prompt 模板（含占位符）',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_gen_rule_depth` (`depth`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='地点生成规则表';

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

-- ========== 地点生成规则种子（按 depth 2-5） ==========
INSERT INTO `location_gen_rule` (`depth`, `loc_type`, `min_children`, `max_children`, `naming_style`, `danger_range`, `world_constraints`, `gen_prompt`)
SELECT * FROM (
  SELECT 2 AS d, 'empire' AS lt, 2 AS mn, 5 AS mx,
    '帝国/王国名，参考中国古代诸侯国名，如加玛帝国、出云帝国' AS ns,
    '1-3' AS dr,
    '每个帝国应该有独特特色（军事/商业/中立/神秘）。帝国之间可以有敌对或同盟关系。' AS wc,
    '你是斗气大陆的世界观设计师。请为"{parent_name}"区域生成{count}个帝国或大型势力范围。\n【严格约束】\n- 名称必须是中文，风格：{naming_style}\n- 每个帝国必须包含：名称、类型、一句话描述、势力特征\n- 必须符合斗气大陆的世界观（修炼体系、强者为尊）\n- {forbidden}\n- {world_constraints}\n【输出格式】只输出JSON数组\n[\n  {\n    "name": "帝国名",\n    "loc_type": "empire",\n    "description": "一句话描述这个帝国的特色",\n    "danger_level": 1,\n    "tags": ["军事型/商业型/中立型/神秘型"]\n  }\n]' AS gp
) t0
WHERE NOT EXISTS (SELECT 1 FROM `location_gen_rule` WHERE `depth` = 2);

INSERT INTO `location_gen_rule` (`depth`, `loc_type`, `min_children`, `max_children`, `naming_style`, `danger_range`, `world_constraints`, `gen_prompt`)
SELECT * FROM (
  SELECT 3 AS d, 'mixed' AS lt, 3 AS mn, 7 AS mx,
    '城市、山脉、宗派、秘境名，风格参考仙侠小说' AS ns,
    '1-3' AS dr,
    '必须包含至少1个城市、1个野外、1个宗派或秘境。类型分布：city/wild/sect/secret。野外(wild)的danger_level只能是1-3，1=一阶魔兽区，2=二阶魔兽区，3=三阶魔兽区。城市danger_level为0。' AS wc,
    '你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个地点。\n【地点类型】每个地点必须是以下之一：\n- city: 城市（有人聚居、有交易）\n- wild: 野外（魔兽栖息、危险但有资源）\n- sect: 宗派驻地（势力总部）\n- secret: 秘境/遗迹（特殊地点，稀有）\n【严格约束】\n- 名称必须符合斗气大陆仙侠风格\n- 至少包含1个city类型和1个wild类型\n- 危险等级范围：{danger_range}（野外danger_level只允许1-3，城市为0）\n- 野外danger_level含义：1=一阶魔兽区，2=二阶魔兽区，3=三阶魔兽区\n- {forbidden}\n【输出格式】只输出JSON数组\n[\n  {\n    "name": "地点名",\n    "loc_type": "city/wild/sect/secret",\n    "description": "一句话描述",\n    "danger_level": 1,\n    "available_actions": ["buy","sell","quest","train","fight","explore"],\n    "tags": ["特色标签"]\n  }\n]' AS gp
) t3
WHERE NOT EXISTS (SELECT 1 FROM `location_gen_rule` WHERE `depth` = 3);

INSERT INTO `location_gen_rule` (`depth`, `loc_type`, `min_children`, `max_children`, `naming_style`, `danger_range`, `world_constraints`, `gen_prompt`)
SELECT * FROM (
  SELECT 4 AS d, 'district' AS lt, 2 AS mn, 5 AS mx,
    '区域内景点名，如坊市、佣兵公会、药材商行、修炼场' AS ns,
    '1-3' AS dr,
    '区域类型要与父节点匹配：城市内是功能区域，野外内是野外深处，宗派内是功能区域。野外(wild2)的danger_level只能是1-3，继承父级wild的danger_level。非野外区域danger_level为0。' AS wc,
    '你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个内部区域。\n【区域类型】根据父节点类型选择：\n城市(city)内部：坊市、佣兵公会、拍卖场、药材商行、冶炼坊、丹房、家族宅邸、地下黑市、城主府、修炼室、修炼场\n（其中"坊市"、"佣兵公会"、"丹房"为每个城市必须且只能各包含一个的核心功能地点）\n野外(wild)内部：必须是更深层的野外区域，如入口区、深处、核心区、隐藏洞穴、稀有资源点\n宗派(sect)内部：外门、内门、藏经阁、练功场、长老殿、丹房、禁地\n秘境(secret)内部：前厅、核心区域、守护者区域、宝物室、迷宫通道\n【严格约束】\n- 坊市/交易场所 loc_type="market"；修炼室/修炼场 loc_type="cultivation"；冶炼坊/锻造坊 loc_type="forging"；丹房 loc_type="alchemy"；其余城市内部区域用 "district"\n- 每个城市必须且只能各包含一个"坊市"、一个"佣兵公会"、一个"丹房"\n- 如果父节点是野外类型，loc_type必须设为"wild2"，danger_level继承父节点（1-3）\n- 非野外区域danger_level设为0\n- {forbidden}\n【输出格式】只输出JSON数组\n[\n  {\n    "name": "区域名",\n    "loc_type": "district",\n    "description": "一句话描述",\n    "danger_level": 1,\n    "available_actions": ["buy","sell","quest","train","fight","explore","rest"],\n    "tags": ["标签"]\n  }\n]' AS gp
) t4
WHERE NOT EXISTS (SELECT 1 FROM `location_gen_rule` WHERE `depth` = 4);

INSERT INTO `location_gen_rule` (`depth`, `loc_type`, `min_children`, `max_children`, `naming_style`, `danger_range`, `world_constraints`, `gen_prompt`)
SELECT * FROM (
  SELECT 5 AS d, 'scene' AS lt, 2 AS mn, 4 AS mx,
    '具体场景名，如某个摊位、某个房间、某棵树旁' AS ns,
    '1-3' AS dr,
    '场景是最细粒度的地点，应该有具体的交互对象。如：炼药炉旁、悬赏牌前、老者摊位。野外(wild3)的danger_level只能是1-3，继承父级wild2的danger_level。非野外场景danger_level为0。' AS wc,
    '你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个具体场景。\n【场景是最细粒度的地点】\n每个场景应该有具体的交互对象或事件触发点。\n【严格约束】\n- 场景名称要具体，如"悬赏牌前"、"炼药炉旁"、"密林深处"\n- 每个场景应该暗示可能的交互\n- 如果父节点是wild2类型，loc_type必须设为"wild3"，danger_level继承父节点（1-3）\n- 非野外场景danger_level设为0\n- {forbidden}\n【输出格式】只输出JSON数组\n[\n  {\n    "name": "场景名",\n    "loc_type": "scene",\n    "description": "一句话描述",\n    "danger_level": 1,\n    "available_actions": ["buy","sell","quest","train","fight","explore","rest","gather"],\n    "tags": ["标签"]\n  }\n]' AS gp
) t5
WHERE NOT EXISTS (SELECT 1 FROM `location_gen_rule` WHERE `depth` = 5);
