-- ========== dialog_session 加 npc_type 列（区分 static / dynamic NPC） ==========
-- 背景：static_npc 与 dynamic_npc 各自独立自增 id，id 空间重叠（static#5 vs dynamic#5
--   会撞号）。要让动态 NPC 也能进入对话会话，必须用 npc_type 区分 npc_id 指向哪张表。
-- 存量数据全部是静态 NPC 对话，默认 'static'，无需回填。
-- 幂等：ALTER 无 IF NOT EXISTS，重复执行报 Duplicate column，忽略即可。

ALTER TABLE `dialog_session`
  ADD COLUMN `npc_type` VARCHAR(8) NOT NULL DEFAULT 'static'
  COMMENT 'static=静态NPC(static_npc); dynamic=动态NPC(dynamic_npc)'
  AFTER `npc_id`;
