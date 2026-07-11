-- ========== 静态 NPC 模块建表（幂等） ==========
-- 依赖：location 表（init.sql 已建）、player 表
-- 表：nature（性格参考）/ npc_role（职能参考）/ static_npc（NPC 实例）/ dialog_log（对话上下文日志）
-- dialog_log 记录完整 messages 上下文，比 agent_call_log（仅 token）更精细，供后续 agent 记忆 + 对话分析

-- ---------- NPC 性格参考表 ----------
CREATE TABLE IF NOT EXISTS `nature` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(32) NOT NULL COMMENT '性格名（豪爽/阴沉等）',
  `prompt_hint` VARCHAR(255) NOT NULL COMMENT '性格提示词（喂给 LLM 的人格描述）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_nature_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='NPC性格参考表';

-- ---------- NPC 职能参考表 ----------
CREATE TABLE IF NOT EXISTS `npc_role` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(32) NOT NULL COMMENT '职能名（公会接待员/炼药师等）',
  `prompt_hint` VARCHAR(255) NOT NULL COMMENT '职能提示词（喂给 LLM 的身份描述）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_npc_role_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='NPC职能参考表';

-- ---------- 静态 NPC 实例表 ----------
CREATE TABLE IF NOT EXISTS `static_npc` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(32) NOT NULL COMMENT 'NPC姓名',
  `gender` VARCHAR(4) NOT NULL DEFAULT '男' COMMENT '性别',
  `age` VARCHAR(16) NOT NULL DEFAULT '中年' COMMENT '年龄段：少年/青年/中年/老年',
  `nature_id` INT NOT NULL COMMENT '性格ID → nature.id',
  `role_id` INT NOT NULL COMMENT '职能ID → npc_role.id',
  `location_id` INT NOT NULL COMMENT '所在地点ID → location.id',
  `greeting` VARCHAR(255) DEFAULT NULL COMMENT '固定开场白（可空，空则用 LLM 生成）',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_static_npc_location` (`location_id`),
  KEY `idx_static_npc_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='静态NPC实例表';

-- 注：对话日志表已迁移到 add_dialog_session.sql（dialog_session + agent_dialog_call 双轨结构）


-- ========== 种子数据（幂等） ==========

-- ---------- 性格（8 种） ----------
INSERT INTO `nature` (`name`, `prompt_hint`) VALUES
('豪爽', '说话直来直去，热情大方，喜欢称兄道弟，语气爽朗'),
('阴沉', '话少寡言，语气低沉压抑，眼神阴鸷，给人压迫感'),
('热情', '积极主动，对来客嘘寒问暖，话多且殷勤'),
('冷淡', '惜字如金，态度疏离，公事公办，不苟言笑'),
('精明', '言辞圆滑，算计精到，三句话不离利益，擅长察言观色'),
('憨厚', '质朴老实，说话慢条斯理，容易相信他人'),
('高傲', '目中无人，语气居高临下，轻视弱者'),
('随和', '平易近人，语气轻松幽默，不摆架子')
ON DUPLICATE KEY UPDATE `prompt_hint` = VALUES(`prompt_hint`);

-- ---------- 职能（10 种） ----------
INSERT INTO `npc_role` (`name`, `prompt_hint`) VALUES
('公会接待员', '佣兵公会的接待，负责登记委托、发放赏金，熟悉各种悬赏任务'),
('坊市管理员', '坊市的管事，掌管摊位租赁和市场秩序，了解各类货产行情'),
('拍卖师', '拍卖行的主持，口才了得，煽动气氛，熟知珍稀物品价值'),
('炼药师', '精通丹药炼制的药师，对药材和丹方如数家珍'),
('铁匠', '打铁为生的匠人，擅长锻造兵器，粗犷豪迈'),
('锻造师', '高级锻造大师，能打造灵器宝兵，对材料要求苛刻'),
('药材商', '经营药材生意的商人，熟悉各种灵药产地和功效'),
('旅馆老板', '客栈掌柜，消息灵通，三教九流都打听过'),
('修炼场教官', '修炼场的教头，指导后辈修炼，严厉负责'),
('修炼室管理员', '修炼室执事，负责分配修炼资源，按规矩办事')
ON DUPLICATE KEY UPDATE `prompt_hint` = VALUES(`prompt_hint`);

-- ---------- 测试 NPC 实例（挂在「中州」区域，繁华核心适合放 NPC） ----------
-- 用子查询按名称绑定 location_id，避免硬编码 id
INSERT INTO `static_npc` (`name`, `gender`, `age`, `nature_id`, `role_id`, `location_id`, `greeting`)
SELECT '王掌柜', '男', '中年',
       (SELECT id FROM nature WHERE name='精明'),
       (SELECT id FROM npc_role WHERE name='坊市管理员'),
       (SELECT id FROM location WHERE name='中州'),
       NULL
WHERE NOT EXISTS (SELECT 1 FROM static_npc WHERE name='王掌柜');

INSERT INTO `static_npc` (`name`, `gender`, `age`, `nature_id`, `role_id`, `location_id`, `greeting`)
SELECT '李药师', '女', '青年',
       (SELECT id FROM nature WHERE name='冷淡'),
       (SELECT id FROM npc_role WHERE name='炼药师'),
       (SELECT id FROM location WHERE name='中州'),
       NULL
WHERE NOT EXISTS (SELECT 1 FROM static_npc WHERE name='李药师');

INSERT INTO `static_npc` (`name`, `gender`, `age`, `nature_id`, `role_id`, `location_id`, `greeting`)
SELECT '赵教头', '男', '中年',
       (SELECT id FROM nature WHERE name='豪爽'),
       (SELECT id FROM npc_role WHERE name='修炼场教官'),
       (SELECT id FROM location WHERE name='中州'),
       NULL
WHERE NOT EXISTS (SELECT 1 FROM static_npc WHERE name='赵教头');
