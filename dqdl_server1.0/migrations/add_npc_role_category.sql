-- ========== npc_role 扩展：增加职业图鉴维度 ==========
-- 背景：原 npc_role 仅存10条静态职能（公会接待员/坊市管理员…），覆盖不到
--   动态演员职业（散修/佣兵/赏金猎人…）。refine_script.py 的 cast[].is_dynamic
--   概念需要一张可扩展的职业池支撑。
-- 改造：复用 npc_role 表，加 category 区分「静态职能」与「动态职业」，
--   Agent 运行时也可往里插新职业（is_system=0），不新建 profession 表。
-- 幂等：ALTER 无 IF NOT EXISTS（MySQL 8.0.29- 不支持），重复执行会报
--   "Duplicate column"，忽略即可；INSERT 用 ON DUPLICATE KEY UPDATE。

ALTER TABLE `npc_role`
  ADD COLUMN `category` VARCHAR(16) NOT NULL DEFAULT 'role'
    COMMENT 'role=静态职能(接待员/管理员…); profession=动态职业(散修/佣兵/赏金猎人…)'
    AFTER `name`,
  ADD COLUMN `is_system` TINYINT NOT NULL DEFAULT 1
    COMMENT '1=系统内置(seed); 0=Agent运行时创建';

-- 补 profession 类种子（与 refine_script.py 的 NPC_ROLES 后7项对齐）
INSERT INTO `npc_role` (`name`, `category`, `prompt_hint`, `is_system`) VALUES
('散修', 'profession', '无门无派的独行修炼者，资源紧张，警惕心强，言谈务实', 1),
('佣兵', 'profession', '佣兵公会注册成员，认钱办事，豪爽粗犷，江湖气重', 1),
('赏金猎人', 'profession', '专接悬赏的危险职业，寡言冷峻，务实高效', 1),
('采药人', 'profession', '长年游走野外采药，熟悉药草，谨慎谦卑', 1),
('魔修', 'profession', '修炼魔道功法，阴沉诡谲，喜怒无常', 1),
('遗迹寻宝者', 'profession', '痴迷上古遗迹，见多识广，精明贪婪', 1),
('落魄贵族', 'profession', '昔日名门之后，高傲矜持，言语带旧式礼仪', 1)
ON DUPLICATE KEY UPDATE `prompt_hint` = VALUES(`prompt_hint`);
