-- ========== NPC 交易系统建表（幂等） ==========
-- dialog_event：对话弹窗快捷按钮来源（挂 npc_role）
-- npc_shop：配货表（npc_role 维度，同 role 的 NPC 共享商品）
-- 配一个 role_id==1（公会接待员）的测试 NPC 以便端到端验证

-- ---------- dialog_event 表（对话快捷事件） ----------
CREATE TABLE IF NOT EXISTS `dialog_event` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `role_id` INT NOT NULL COMMENT '职能ID → npc_role.id',
  `text` VARCHAR(128) NOT NULL COMMENT '按钮文案（如：我想买卖些物品）',
  `event` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '事件类型字符串（trade/...）',
  `sort` INT NOT NULL DEFAULT 0 COMMENT '排序',
  PRIMARY KEY (`id`),
  KEY `idx_dialog_event_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='NPC对话快捷事件表（按钮来源）';

-- ---------- npc_shop 表（配货表，npc_role 维度） ----------
CREATE TABLE IF NOT EXISTS `npc_shop` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `role_id` INT NOT NULL COMMENT '职能ID → npc_role.id（同role共享商品）',
  `item_id` VARCHAR(32) NOT NULL COMMENT '物品ID → item.item_id',
  `sort` INT NOT NULL DEFAULT 0 COMMENT '排序（数值越小越靠前）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_npc_shop_role_item` (`role_id`, `item_id`),
  KEY `idx_npc_shop_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='NPC商店配货表（npc_role维度）';


-- ========== 种子数据（幂等） ==========

-- ---------- dialog_event：公会接待员(role=1) 的交易入口 ----------
INSERT INTO `dialog_event` (`role_id`, `text`, `event`, `sort`)
SELECT 1, '我想买卖些物品', 'trade', 0
WHERE NOT EXISTS (
  SELECT 1 FROM dialog_event WHERE role_id = 1 AND event = 'trade'
);

-- ---------- npc_shop：公会接待员(role=1) 出售的物品 ----------
-- 复用现有 item（add_skill/add_technique 种的武技/功法，price=100）
INSERT INTO `npc_shop` (`role_id`, `item_id`, `sort`) VALUES
(1, 'dj-001', 1),   -- 八极崩
(1, 'dj-004', 2),   -- 吸掌
(1, 'dj-005', 3),   -- 吹火诀
(1, 'dj-013', 4),   -- 磐石护体
(1, 'gf-h1-1', 5)   -- 弄焰诀
ON DUPLICATE KEY UPDATE `sort` = VALUES(`sort`);

-- ---------- 测试 NPC：公会接待员（挂中州） ----------
INSERT INTO `static_npc` (`name`, `gender`, `age`, `nature_id`, `role_id`, `location_id`, `greeting`)
SELECT '钱掌柜', '男', '中年',
       (SELECT id FROM nature WHERE name='精明'),
       1,
       (SELECT id FROM location WHERE name='中州'),
       NULL
WHERE NOT EXISTS (SELECT 1 FROM static_npc WHERE name='钱掌柜');
