-- ========== npc_role 补充 required_in_loc_type 列（场景类型→职能 的可配置映射） ==========
-- 幂等。用途：城市新场景创建时，按场景类型查"必生 NPC 职能"。
--   guild(佣兵工会) → 公会接待员
--   market(坊市)    → 坊市管理员
--   alchemy(炼药师公会) → 炼药师
-- 列存 JSON 数组（一个职能可能出现在多个场景类型），与 Python seed_npc.py 的 required_in_loc_type 对齐。

ALTER TABLE `npc_role`
  ADD COLUMN `required_in_loc_type` JSON NULL
  COMMENT '必出现此职能的场景类型数组，如["guild"]；空/NULL 表示不强制' AFTER `prompt_hint`;

-- 按职能名回填（与 seed_npc.py 保持一致；ON DUPLICATE 防重复执行报错）
UPDATE `npc_role` SET `required_in_loc_type` = JSON_ARRAY('guild')
  WHERE `name` = '公会接待员' AND `required_in_loc_type` IS NULL;
UPDATE `npc_role` SET `required_in_loc_type` = JSON_ARRAY('market')
  WHERE `name` = '坊市管理员' AND `required_in_loc_type` IS NULL;
UPDATE `npc_role` SET `required_in_loc_type` = JSON_ARRAY('alchemy')
  WHERE `name` = '炼药师' AND `required_in_loc_type` IS NULL;
UPDATE `npc_role` SET `required_in_loc_type` = JSON_ARRAY('auction')
  WHERE `name` = '拍卖师' AND `required_in_loc_type` IS NULL;
