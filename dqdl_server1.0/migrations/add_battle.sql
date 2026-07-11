-- 战斗系统建表脚本：buff 定义表 + buff 效果子表 + 战斗日志表。
-- 本脚本幂等：可重复执行。建表用 IF NOT EXISTS，插入用 INSERT ... ON DUPLICATE KEY。
-- 字段设计沿用老版本 dqdl-server（buff/buff_effect），新增 battle_log（重构版）。

-- ========== buff 定义表 ==========
CREATE TABLE IF NOT EXISTS `buff` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(32) NOT NULL COMMENT 'buff键(引擎/技能引用)',
  `name` VARCHAR(32) NOT NULL,
  `icon` VARCHAR(8) NOT NULL DEFAULT '✦',
  `type` VARCHAR(16) NOT NULL DEFAULT 'buff' COMMENT 'buff/debuff/dot/status',
  `duration` INT NOT NULL DEFAULT 3 COMMENT '持续回合(0=永久)',
  `stack_rule` VARCHAR(16) NOT NULL DEFAULT 'refresh' COMMENT 'none/refresh/stack',
  `max_stack` INT NOT NULL DEFAULT 1,
  `snapshot` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否快照施法者属性(DNF锁定)',
  `priority` INT NOT NULL DEFAULT 0 COMMENT '默认派发优先级',
  `tags` TEXT DEFAULT NULL COMMENT '状态标签JSON(["stun"])',
  `description` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_buff_key` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Buff定义表';

-- ========== buff 效果子表 ==========
CREATE TABLE IF NOT EXISTS `buff_effect` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `buff_id` INT NOT NULL,
  `hook` VARCHAR(24) NOT NULL COMMENT 'onTurnStart/onTurnEnd/beforeAttack/beforeHit/afterHit/afterAttack/passive',
  `fn_id` VARCHAR(32) NOT NULL COMMENT 'buff-library 函数id',
  `params` TEXT DEFAULT NULL COMMENT '参数JSON',
  `priority` INT NOT NULL DEFAULT 0,
  `consume` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '触发后消耗一层(一次性)',
  PRIMARY KEY (`id`),
  KEY `idx_buff_effect_buff` (`buff_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Buff效果子表';

-- ========== 战斗日志表 ==========
CREATE TABLE IF NOT EXISTS `battle_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '玩家ID',
  `mob_id` VARCHAR(64) DEFAULT NULL COMMENT '怪物图鉴ID',
  `mob_name` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '怪物名',
  `result` VARCHAR(8) NOT NULL DEFAULT 'flee' COMMENT 'win/lose/flee',
  `rounds` INT NOT NULL DEFAULT 0 COMMENT '回合数',
  `log` TEXT COMMENT '完整战报(叙事文本)',
  `player_hp` INT NOT NULL DEFAULT 0 COMMENT '结束时玩家剩余血量',
  `mob_hp` INT NOT NULL DEFAULT 0 COMMENT '结束时怪物剩余血量',
  `started_at` DATETIME(6) DEFAULT NULL COMMENT '战斗开始时间',
  `ended_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT '战斗结束时间',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_battle_log_player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='战斗日志表';

-- ========== buff 种子数据（沿用老版 battle.seed.ts SEED_BUFFS）==========
-- 先清空再插入，保证 id 稳定（buff_effect.buff_id 依赖 id）。
DELETE FROM `buff`;
ALTER TABLE `buff` AUTO_INCREMENT = 1;

INSERT INTO `buff` (`key`, `name`, `icon`, `type`, `duration`, `stack_rule`, `max_stack`, `snapshot`, `priority`, `tags`, `description`) VALUES
('bleed',        '撕裂',   '🩸', 'dot',    3, 'refresh', 1, 1, 0, NULL,             '每回合流失生命'),
('burn',         '灼烧',   '🔥', 'dot',    3, 'refresh', 1, 1, 0, NULL,             '每回合受到灼烧伤害'),
('trauma',       '内伤',   '💢', 'dot',    4, 'stack',   3, 1, 0, NULL,             '每回合受到内伤伤害，可叠加加深'),
('weak',         '虚弱',   '🥀', 'debuff', 3, 'refresh', 1, 0, 0, NULL,             '力量降低25%'),
('slow',         '减速',   '🐌', 'debuff', 3, 'refresh', 1, 0, 0, NULL,             '敏捷降低25%'),
('stun',         '眩晕',   '💫', 'status', 1, 'refresh', 1, 0, 0, '["stun"]',       '眩晕，无法行动'),
('power_surge',  '刚猛',   '💪', 'buff',   3, 'refresh', 1, 0, 0, NULL,             '力量提升30%'),
('shield',       '护盾',   '🛡', 'buff',   3, 'refresh', 1, 0, 0, NULL,             '受到的伤害降低40%'),
('evasion',      '闪避',   '👻', 'buff',   3, 'refresh', 1, 0, 0, NULL,             '有40%概率闪避攻击'),
('vampire',      '吸血',   '🦇', 'buff',   5, 'refresh', 1, 0, 0, NULL,             '造成伤害时吸取生命'),
('thorns',       '荆棘',   '🌵', 'buff',   5, 'refresh', 1, 0, 0, NULL,             '受到攻击时反弹伤害'),
('pojia',        '破甲',   '⚔', 'buff',   3, 'refresh', 1, 0, 0, NULL,             '下次攻击无视对方部分减伤'),
('barrier',      '护体盾', '🛡', 'buff',   3, 'refresh', 1, 0, 0, NULL,             '吸收{amount}点伤害');

-- ========== buff_effect 种子数据（沿用老版 battle.seed.ts SEED_EFFECTS）==========
DELETE FROM `buff_effect`;

INSERT INTO `buff_effect` (`buff_id`, `hook`, `fn_id`, `params`, `priority`, `consume`) VALUES
((SELECT id FROM buff WHERE `key`='bleed'),       'onTurnStart',  'dot',         '{"scale":"power","ratio":2}', 0, 0),
((SELECT id FROM buff WHERE `key`='burn'),        'onTurnStart',  'dot',         '{"scale":"intelligence","ratio":0.5,"flat":4}', 0, 0),
((SELECT id FROM buff WHERE `key`='trauma'),      'onTurnStart',  'dot',         '{"scale":"power","ratio":0.3,"flat":6}', 0, 0),
((SELECT id FROM buff WHERE `key`='weak'),        'passive',      'stat',        '{"attr":"power","op":"mul","value":-0.25}', 0, 0),
((SELECT id FROM buff WHERE `key`='slow'),        'passive',      'stat',        '{"attr":"quick","op":"mul","value":-0.25}', 0, 0),
((SELECT id FROM buff WHERE `key`='power_surge'), 'passive',      'stat',        '{"attr":"power","op":"mul","value":0.3}', 0, 0),
((SELECT id FROM buff WHERE `key`='shield'),      'beforeHit',    'damage_mul',  '{"value":-0.4}', 5, 0),
((SELECT id FROM buff WHERE `key`='evasion'),     'beforeHit',    'dodge',       '{"prob":0.4}', 1, 0),
((SELECT id FROM buff WHERE `key`='vampire'),     'afterAttack',  'lifesteal',   '{"value":0.12}', 0, 0),
((SELECT id FROM buff WHERE `key`='thorns'),      'afterHit',     'reflect',     '{"value":0.25}', 0, 0),
((SELECT id FROM buff WHERE `key`='pojia'),       'beforeAttack', 'post_carry',  '{"at":"beforeHit","kind":"armorPen","scale":"power","ratio":0.5,"maxPen":0.75,"icon":"⚔","label":"破甲"}', 10, 0);
